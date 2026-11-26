import { toDeviceDto, toReadingDto } from '../domain/dto.js';
import { StatusSchema, TelemetrySchema } from '../domain/schemas.js';
import { createLogger } from '../lib/logger.js';
import type { Realtime } from '../realtime/socket.js';
import type { RulesEngine } from '../rules/engine.js';
import type { DevTools } from '../dev/devTools.js';
import { getDevice, setPresence, type PresenceResult } from '../services/devices.js';
import { pickTimestamp, saveReading } from '../services/readings.js';
import { parseTopic } from './topics.js';

const log = createLogger('ingest');

interface IngestDeps {
  realtime: Realtime;
  rules: RulesEngine;
  /** Remembers which devices are the simulator (dev-only Demo tools). */
  devTools: Pick<DevTools, 'noteTelemetry'>;
  /** Start of the current broker connection (null while disconnected). */
  listeningSince: () => Date | null;
}

export interface Ingest {
  handleMessage(topic: string, payload: Buffer, retained: boolean): void;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function createIngest({ realtime, rules, devTools, listeningSince }: IngestDeps): Ingest {
  // Messages of one device are processed strictly in order (presence and alert
  // rules depend on the previous message); different devices run concurrently.
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

  /**
   * On an online/offline transition: emit device:status and create the
   * offline/online alert.
   */
  async function afterPresence(
    deviceId: string,
    presence: PresenceResult,
    offlineReason: string,
  ): Promise<void> {
    if (!presence.changed) return;
    const { device } = presence;
    realtime.emitDeviceStatus(toDeviceDto(device));
    log.info(`${deviceId} is ${device.online ? 'online' : 'offline'}`);
    // No online/offline alerts for a device we have never heard from live
    // (e.g. registered from a retained status message).
    if (presence.seenBefore) {
      if (device.online) await rules.deviceCameOnline(device);
      else await rules.deviceWentOffline(device, offlineReason);
    }
  }

  async function handleTelemetry(deviceId: string, text: string, receivedAt: Date): Promise<void> {
    const parsed = TelemetrySchema.safeParse(parseJson(text));
    if (!parsed.success) {
      log.warn(`${deviceId}: invalid telemetry dropped`, parsed.error.issues.slice(0, 5));
      return;
    }
    // Failing sensors (their values are null): log only when the set changes.
    const errors = (parsed.data.errors ?? []).slice().sort().join(',');
    if ((sensorErrors.get(deviceId) ?? '') !== errors) {
      sensorErrors.set(deviceId, errors);
      if (errors) log.warn(`${deviceId}: sensor error(s): ${errors}`);
      else log.info(`${deviceId}: all sensors ok`);
    }

    const t = parsed.data;
    devTools.noteTelemetry(deviceId, t.simulator);
    const presence = await setPresence(deviceId, true, receivedAt, t.intervalSec, {
      rssi: t.rssi,
      uptimeSec: t.uptimeSec,
      soilDryMv: t.soilDryMv,
      soilWetMv: t.soilWetMv,
    });
    if (presence.calibrationChanged) {
      log.info(`${deviceId} soil calibration now dry ${t.soilDryMv} / wet ${t.soilWetMv} mV`);
    }
    const ts = pickTimestamp(parsed.data.ts, receivedAt);
    const reading = await saveReading(deviceId, parsed.data, ts);

    // device:status acknowledges a changed soil calibration (once). afterPresence
    // emits device:status itself when online/offline changed.
    if (presence.calibrationChanged && !presence.changed) {
      realtime.emitDeviceStatus(toDeviceDto(presence.device));
    }

    realtime.emitTelemetry(toReadingDto(reading));
    await afterPresence(deviceId, presence, '');
    await rules.evaluateReading(presence.device, reading);
  }

  async function handleStatus(
    deviceId: string,
    text: string,
    retained: boolean,
    receivedAt: Date,
  ): Promise<void> {
    // An empty retained payload means someone cleared the retained message
    // (`mosquitto_pub -r -n -t …`): nothing to do.
    if (text.trim() === '') {
      log.debug(`${deviceId}: retained status cleared`);
      return;
    }
    const parsed = StatusSchema.safeParse(text.trim());
    if (!parsed.success) {
      log.warn(`${deviceId}: invalid status "${text.slice(0, 40)}" dropped`);
      return;
    }
    const online = parsed.data === 'online';

    if (retained) {
      // Replayed by the broker on every (re)subscribe, possibly days old. Rules:
      // - never auto-register a device from it (old test devices would come back)
      // - "online" proves nothing (the device may have died before its Last Will)
      // - "offline" is trusted, unless we've heard the device live since this
      //   broker connection started (then the retained message is older)
      const existing = await getDevice(deviceId);
      if (!existing) {
        log.debug(`${deviceId}: retained "${parsed.data}" for unknown device ignored`);
        return;
      }
      if (online) return;
      const since = listeningSince();
      if (existing.lastSeen && since && existing.lastSeen >= since) return;
      const presence = await setPresence(deviceId, false, null); // old: don't touch lastSeen
      await afterPresence(deviceId, presence, 'Last Will or shutdown');
      return;
    }

    const presence = await setPresence(deviceId, online, receivedAt);
    await afterPresence(deviceId, presence, 'Last Will or shutdown');
  }

  return {
    handleMessage(topic, payload, retained) {
      const route = parseTopic(topic);
      if (!route) {
        log.debug(`ignored topic ${topic}`);
        return;
      }
      const receivedAt = new Date();
      const text = payload.toString('utf8');
      enqueue(route.deviceId, () =>
        route.kind === 'telemetry'
          ? handleTelemetry(route.deviceId, text, receivedAt)
          : handleStatus(route.deviceId, text, retained, receivedAt),
      );
    },
  };
}
