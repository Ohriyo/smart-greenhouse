import type { DeviceCommand } from '../domain/schemas.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('command');

/**
 * A queued command waits this long for the device's next reading (the firmware
 * sends one every 30 s). Older ones are dropped, so a device that comes back much
 * later isn't surprised by an old calibration request.
 */
export const COMMAND_TTL_MS = 120_000;

/** How a reading reached the backend. */
export type Transport = 'mqtt' | 'https';

/**
 * Commands waiting for a device's next reading. Kept in memory: a backend restart
 * drops pending commands, and the app reports that the device didn't confirm.
 */
export interface PendingCommands {
  /** Queues a command; a pending command of the same type is replaced (the newest wins). */
  enqueue(deviceId: string, command: DeviceCommand): void;
  /** Removes and returns the device's commands that are still fresh, oldest first. */
  take(deviceId: string): DeviceCommand[];
}

export function createPendingCommands(clock: () => number = Date.now): PendingCommands {
  const queues = new Map<string, { command: DeviceCommand; at: number }[]>();

  return {
    enqueue(deviceId, command) {
      const queue = (queues.get(deviceId) ?? []).filter((q) => q.command.type !== command.type);
      queue.push({ command, at: clock() });
      queues.set(deviceId, queue);
    },

    take(deviceId) {
      const queue = queues.get(deviceId);
      if (!queue) return [];
      queues.delete(deviceId);
      const now = clock();
      return queue.filter((q) => now - q.at <= COMMAND_TTL_MS).map((q) => q.command);
    },
  };
}

/** Publishes a command on greenhouse/{id}/command (src/mqtt/commands.ts). */
export interface CommandPublisher {
  isConnected(): boolean;
  /** Rejects when the broker is down or doesn't acknowledge in time. */
  publish(deviceId: string, command: DeviceCommand): Promise<void>;
}

/** "mqtt" = published to the device right away; "queued" = goes with its next reading. */
export type Delivery = 'mqtt' | 'queued';

/**
 * Sends each command the fastest way the device can receive it:
 * - its latest reading came over MQTT → published on its command topic at once;
 * - otherwise (HTTPS fallback, MQTT off, unknown) → queued and returned in the
 *   response to its next POST /api/readings. A reading that arrives over MQTT
 *   later picks up the queue too (see takeFor).
 * Either way the device acknowledges by reporting the new state in a reading.
 */
export interface CommandRouter {
  deliver(deviceId: string, command: DeviceCommand): Promise<Delivery>;
  /** Fire-and-forget deliver (dev tools). */
  enqueue(deviceId: string, command: DeviceCommand): void;
  /** Called by the ingest for every stored reading: notes the transport, returns queued commands. */
  takeFor(deviceId: string, via: Transport): DeviceCommand[];
  /** The device's MQTT session ended (its Last Will): queue until it is heard again. */
  linkLost(deviceId: string): void;
  /** The transport of the device's latest reading since this process started. */
  transportOf(deviceId: string): Transport | undefined;
}

export function createCommandRouter(
  pending: PendingCommands,
  publisher: CommandPublisher | null,
): CommandRouter {
  const lastVia = new Map<string, Transport>();

  async function deliver(deviceId: string, command: DeviceCommand): Promise<Delivery> {
    if (publisher?.isConnected() && lastVia.get(deviceId) === 'mqtt') {
      try {
        await publisher.publish(deviceId, command);
        return 'mqtt';
      } catch (err) {
        log.warn(
          `${deviceId}: ${command.type} not published (${err instanceof Error ? err.message : String(err)}); queued for the next reading`,
        );
      }
    }
    pending.enqueue(deviceId, command);
    log.info(`${deviceId} <- ${command.type} (${command.id}) queued for the next reading`);
    return 'queued';
  }

  return {
    deliver,
    enqueue(deviceId, command) {
      void deliver(deviceId, command);
    },
    takeFor(deviceId, via) {
      lastVia.set(deviceId, via);
      return pending.take(deviceId);
    },
    linkLost(deviceId) {
      lastVia.delete(deviceId);
    },
    transportOf: (deviceId) => lastVia.get(deviceId),
  };
}
