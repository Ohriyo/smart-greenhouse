import type { DeviceCommand } from '../domain/schemas.js';

/**
 * A command waits this long for the device's next POST /api/readings (the
 * firmware posts every 30 s). Older ones are dropped, so a device that comes
 * back much later isn't surprised by an old calibration request.
 */
export const COMMAND_TTL_MS = 120_000;

/**
 * Commands for devices, delivered in the response to their next reading (the
 * device only talks HTTPS, so it can't be called directly). Kept in memory: a
 * backend restart drops pending commands, and the app reports that the device
 * didn't confirm.
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
