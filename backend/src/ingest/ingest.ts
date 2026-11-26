import { toDeviceDto, toReadingDto, type ReadingDto } from '../domain/dto.js';
import type { DeviceCommand, ReadingBody } from '../domain/schemas.js';
import type { DevTools } from '../dev/devTools.js';
import { createLogger } from '../lib/logger.js';
import type { Realtime } from '../realtime/socket.js';
import type { RulesEngine } from '../rules/engine.js';
import type { Reading } from '../generated/prisma/client.js';
import { setPresence, type PresenceResult } from '../services/devices.js';
import { pickTimestamp, saveReading } from '../services/readings.js';
import type { PendingCommands } from './commands.js';

const log = createLogger('ingest');

export interface IngestResult {
  /** The stored reading. */
  reading: ReadingDto;
  /** Commands queued for this device (delivered once). */
  commands: DeviceCommand[];
}

export interface Ingest {
  /**
   * Stores a reading from POST /api/readings and resolves once it is saved.
   * Alert rules, SMS/push and live updates run afterwards in the background:
   * their failures are logged and never reach the device's request.
   */
  ingestReading(deviceId: string, body: ReadingBody, receivedAt: Date): Promise<IngestResult>;
  /** Resolves when all queued background work has finished (tests, shutdown). */
  idle(): Promise<void>;
}

interface IngestDeps {
  realtime: Realtime;
  rules: RulesEngine;
  /** Remembers which devices are the simulator (dev-only Demo tools). */
  devTools: Pick<DevTools, 'noteTelemetry'>;
  commands: PendingCommands;
}

export function createIngest({ realtime, rules, devTools, commands }: IngestDeps): Ingest {
  // Readings of one device are processed strictly in order (presence and the
  // alert rules depend on the previous reading); devices run concurrently.
  const queues = new Map<string, Promise<void>>();
  /** Last reported sensor error set per device ("dht,soil"), to log changes only. */
  const sensorErrors = new Map<string, string>();

  function enqueue(deviceId: string, task: () => Promise<void>): void {
    const next = (queues.get(deviceId) ?? Promise.resolve()).then(task).catch((err: unknown) => {
      log.error(`processing failed for ${deviceId}`, err);
    });
    queues.set(deviceId, next);
    void next.finally(() => {
      if (queues.get(deviceId) === next) queues.delete(deviceId);
    });
  }

  function logSensorErrors(deviceId: string, errors: readonly string[] | undefined): void {
    const set = [...(errors ?? [])].sort().join(',');
    if ((sensorErrors.get(deviceId) ?? '') === set) return;
    sensorErrors.set(deviceId, set);
    if (set) log.warn(`${deviceId}: sensor error(s): ${set}`);
    else log.info(`${deviceId}: all sensors ok`);
  }

  return {
    ingestReading(deviceId, body, receivedAt) {
      return new Promise<IngestResult>((resolve, reject) => {
        enqueue(deviceId, async () => {
          // 1. Store (the request waits for this part only).
          let presence: PresenceResult;
          let reading: Reading;
          try {
            presence = await setPresence(deviceId, true, receivedAt, body.intervalSec, {
              rssi: body.rssi,
              uptimeSec: body.uptimeSec,
              soilDryMv: body.soilDryMv,
              soilWetMv: body.soilWetMv,
            });
            reading = await saveReading(deviceId, body, pickTimestamp(body.ts, receivedAt));
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
            return;
          }
          resolve({ reading: toReadingDto(reading), commands: commands.take(deviceId) });

          // 2. Everything else, after the device got its answer.
          logSensorErrors(deviceId, body.errors);
          devTools.noteTelemetry(deviceId, body.simulator);
          if (presence.calibrationChanged) {
            log.info(
              `${deviceId} soil calibration now dry ${body.soilDryMv} / wet ${body.soilWetMv} mV`,
            );
          }
          const deviceDto = toDeviceDto(presence.device);
          // device:status: online/offline changed, or a new soil calibration (acknowledgement).
          if (presence.changed || presence.calibrationChanged) realtime.emitDeviceStatus(deviceDto);
          realtime.emitTelemetry(toReadingDto(reading));
          if (presence.changed) {
            log.info(`${deviceId} is online`);
            // No "back online" alert for a device we had never heard from.
            if (presence.seenBefore) await rules.deviceCameOnline(presence.device);
          }
          await rules.evaluateReading(presence.device, reading);
        });
      });
    },

    async idle() {
      // Work may queue more work (e.g. alerts → SMS); loop until it settles.
      while (queues.size > 0) await Promise.all([...queues.values()]);
    },
  };
}
