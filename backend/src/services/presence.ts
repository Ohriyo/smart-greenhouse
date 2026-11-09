import { toDeviceDto } from '../domain/dto.js';
import { createLogger } from '../lib/logger.js';
import type { Realtime } from '../realtime/socket.js';
import type { RulesEngine } from '../rules/engine.js';
import { markStaleDevicesOffline, offlineAfterMs } from './devices.js';

const log = createLogger('presence');
const SWEEP_INTERVAL_MS = 2_000;

interface SweeperDeps {
  realtime: Realtime;
  rules: RulesEngine;
  fallbackSec: number;
  /** Time of the current MQTT connection, or null while the broker is unreachable. */
  listeningSince: () => Date | null;
}

/**
 * Backup for the MQTT Last Will: marks a device offline after 3 missed telemetry
 * intervals (or `fallbackSec` when the interval is unknown). Paused while the
 * broker is unreachable. Returns a stop function.
 */
export function startPresenceSweeper(deps: SweeperDeps): () => void {
  const { realtime, rules, fallbackSec, listeningSince } = deps;
  let running = false;

  const sweep = async () => {
    const since = listeningSince();
    if (!since) return; // can't observe devices without the broker
    const stale = await markStaleDevicesOffline(new Date(), fallbackSec, since);
    for (const device of stale) {
      const silentSec = Math.round(offlineAfterMs(device, fallbackSec) / 1000);
      const reason = device.telemetryIntervalSec
        ? `no data for ${silentSec} s, 3 missed intervals`
        : `no data for ${silentSec} s`;
      log.info(`${device.id} is offline (${reason})`);
      realtime.emitDeviceStatus(toDeviceDto(device));
      if (device.lastSeen) await rules.deviceWentOffline(device, reason);
    }
  };

  const timer = setInterval(() => {
    if (running) return;
    running = true;
    sweep()
      .catch((err: unknown) => {
        log.error('sweep failed', err);
      })
      .finally(() => {
        running = false;
      });
  }, SWEEP_INTERVAL_MS);
  return () => {
    clearInterval(timer);
  };
}
