import { toDeviceDto, toFanStateDto, toReadingDto } from '../domain/dto.js';
import { StatusSchema, TelemetrySchema } from '../domain/schemas.js';
import { createLogger } from '../lib/logger.js';
import type { Realtime } from '../realtime/socket.js';
import type { RulesEngine } from '../rules/engine.js';
import { ensureDevice, setPresence, type PresenceResult } from '../services/devices.js';
import { pickTimestamp, saveReading } from '../services/readings.js';
import { getThresholds } from '../services/thresholds.js';
import type { CommandSender } from './commands.js';
import { parseTopic } from './topics.js';

const log = createLogger('ingest');

interface IngestDeps {
  realtime: Realtime;
  commands: CommandSender;
  rules: RulesEngine;
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

export function createIngest({ realtime, commands, rules }: IngestDeps): Ingest {
  // Messages of one device are processed strictly in order (fan-change detection
  // compares with the previous reading); different devices run concurrently.
  const queues = new Map<string, Promise<void>>();

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
   * On an online/offline transition: emit device:status, create the offline/online
   * alert and, when it came online, push its fan thresholds.
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
    if (device.online && commands.isBrokerConnected()) {
      const t = await getThresholds(deviceId);
      await commands.sendFanThresholds(deviceId, t.fanOnTemp, t.fanOffTemp);
    }
  }

  async function handleTelemetry(deviceId: string, text: string, receivedAt: Date): Promise<void> {
    const parsed = TelemetrySchema.safeParse(parseJson(text));
    if (!parsed.success) {
      log.warn(`${deviceId}: invalid telemetry dropped`, parsed.error.issues.slice(0, 5));
      return;
    }
    const presence = await setPresence(deviceId, true, receivedAt, parsed.data.intervalSec);
    const ts = pickTimestamp(parsed.data.ts, receivedAt);
    const { reading, fanEvent } = await saveReading(deviceId, parsed.data, ts);

    realtime.emitTelemetry(toReadingDto(reading));
    if (fanEvent) realtime.emitFanState(toFanStateDto(fanEvent));
    await afterPresence(deviceId, presence, '');
    await rules.evaluateReading(presence.device, reading);
  }

  async function handleStatus(
    deviceId: string,
    text: string,
    retained: boolean,
    receivedAt: Date,
  ): Promise<void> {
    const parsed = StatusSchema.safeParse(text.trim());
    if (!parsed.success) {
      log.warn(`${deviceId}: invalid status "${text.slice(0, 40)}" dropped`);
      return;
    }
    const online = parsed.data === 'online';
    if (online && retained) {
      // Replayed by the broker on (re)subscribe: it may be stale (device died, Last
      // Will not yet fired), so it doesn't prove the device is alive. Only register
      // unknown devices; fresh telemetry or a live "online" will mark it online.
      const created = await ensureDevice(deviceId);
      if (created) await afterPresence(deviceId, created, '');
      return;
    }
    // A retained "offline" is trusted; it may be old, so it does not update lastSeen.
    const presence = await setPresence(deviceId, online, retained ? null : receivedAt);
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
