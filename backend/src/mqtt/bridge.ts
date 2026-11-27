import { toDeviceDto } from '../domain/dto.js';
import { ReadingBodySchema } from '../domain/schemas.js';
import type { CommandRouter } from '../ingest/commands.js';
import type { Ingest } from '../ingest/ingest.js';
import { createLogger } from '../lib/logger.js';
import type { Realtime } from '../realtime/socket.js';
import type { RulesEngine } from '../rules/engine.js';
import { getDevice, markOfflineIfSilentSince } from '../services/devices.js';
import { parseTopic } from './topics.js';

const log = createLogger('mqtt');

/** Same limit as the HTTP body parser. */
const MAX_PAYLOAD_BYTES = 16 * 1024;
/** After a Last Will, wait one reading interval plus this before calling the device offline. */
export const LAST_WILL_GRACE_MS = 10_000;
const FALLBACK_INTERVAL_SEC = 30;

export interface MqttBridge {
  /** Every message from the broker (client.on('message')). */
  handleMessage(topic: string, payload: Buffer, retained: boolean): void;
  /** Stops pending Last Will timers (shutdown, tests). */
  close(): void;
}

interface BridgeDeps {
  ingest: Ingest;
  commands: Pick<CommandRouter, 'deliver' | 'linkLost'>;
  realtime: Realtime;
  rules: RulesEngine;
  /** Injected in tests (default LAST_WILL_GRACE_MS). */
  lastWillGraceMs?: number;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * MQTT → the same ingest as POST /api/readings (one pipeline for both transports).
 * - telemetry: validated with the HTTP body schema, stored, then any commands that
 *   were queued for the device are published to it.
 * - status "offline" (the device's Last Will, sent by the broker when its connection
 *   dies): if no reading arrives within one interval (+10 s), over MQTT or the HTTPS
 *   fallback, the device is marked offline at once instead of after 3 missed intervals.
 *   The grace avoids an offline/online pair when the ESP32 just switched to HTTPS.
 * - retained status (replayed on every subscribe, maybe days old) is ignored: the
 *   presence sweeper decides from the readings themselves.
 */
export function createMqttBridge(deps: BridgeDeps): MqttBridge {
  const { ingest, commands, realtime, rules } = deps;
  const graceMs = deps.lastWillGraceMs ?? LAST_WILL_GRACE_MS;
  const willTimers = new Map<string, NodeJS.Timeout>();

  function cancelWill(deviceId: string): void {
    const timer = willTimers.get(deviceId);
    if (timer) clearTimeout(timer);
    willTimers.delete(deviceId);
  }

  async function handleTelemetry(deviceId: string, text: string, receivedAt: Date) {
    const parsed = ReadingBodySchema.safeParse(parseJson(text));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      log.warn(
        `${deviceId}: invalid telemetry dropped (${issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'not JSON'})`,
      );
      return;
    }
    const body = parsed.data;
    if (body.deviceId !== undefined && body.deviceId !== deviceId) {
      log.warn(`telemetry on ${deviceId}'s topic names deviceId "${body.deviceId}": dropped`);
      return;
    }
    cancelWill(deviceId);
    const result = await ingest.ingestReading(deviceId, body, receivedAt, 'mqtt');
    for (const command of result.commands) await commands.deliver(deviceId, command);
  }

  async function handleLastWill(deviceId: string, at: Date): Promise<void> {
    const device = await getDevice(deviceId);
    if (!device?.online) return;
    const intervalSec = device.telemetryIntervalSec ?? FALLBACK_INTERVAL_SEC;
    cancelWill(deviceId);
    const timer = setTimeout(
      () => {
        willTimers.delete(deviceId);
        void (async () => {
          const flipped = await markOfflineIfSilentSince(deviceId, at);
          if (!flipped) return; // a reading arrived (e.g. over HTTPS): still online
          log.info(`${deviceId} is offline (MQTT Last Will, no reading since)`);
          realtime.emitDeviceStatus(toDeviceDto(flipped));
          await rules.deviceWentOffline(flipped, 'its MQTT connection was lost');
        })().catch((err: unknown) => {
          log.error(`${deviceId}: Last Will handling failed`, err);
        });
      },
      intervalSec * 1000 + graceMs,
    );
    timer.unref();
    willTimers.set(deviceId, timer);
  }

  function handleStatus(deviceId: string, text: string, retained: boolean, at: Date) {
    const status = text.trim();
    if (retained || status === '') return Promise.resolve(); // old or cleared: see above
    if (status === 'online') {
      cancelWill(deviceId);
      log.info(`${deviceId} connected to the broker`);
      return Promise.resolve();
    }
    if (status === 'offline') {
      commands.linkLost(deviceId); // queue commands until it is heard again
      log.info(`${deviceId} disconnected from the broker (Last Will or clean exit)`);
      return handleLastWill(deviceId, at);
    }
    log.warn(`${deviceId}: invalid status "${status.slice(0, 40)}" dropped`);
    return Promise.resolve();
  }

  return {
    handleMessage(topic, payload, retained) {
      const route = parseTopic(topic);
      if (!route) {
        log.debug(`ignored topic ${topic}`);
        return;
      }
      if (payload.length > MAX_PAYLOAD_BYTES) {
        log.warn(`${route.deviceId}: ${route.kind} of ${payload.length} bytes dropped (too big)`);
        return;
      }
      const receivedAt = new Date();
      const text = payload.toString('utf8');
      const work =
        route.kind === 'telemetry'
          ? handleTelemetry(route.deviceId, text, receivedAt)
          : handleStatus(route.deviceId, text, retained, receivedAt);
      work.catch((err: unknown) => {
        log.error(`${route.deviceId}: ${route.kind} processing failed`, err);
      });
    },

    close() {
      for (const timer of willTimers.values()) clearTimeout(timer);
      willTimers.clear();
    },
  };
}
