import { randomUUID } from 'node:crypto';
import type { PendingCommands } from '../ingest/commands.js';
import { createLogger } from '../lib/logger.js';
import type { SimScenario } from './scenarios.js';

const log = createLogger('dev');

/** A device counts as "simulated" while simulator readings keep arriving. */
export const SIM_FRESH_MS = 30_000;

export interface DevTools {
  /** DEV_TOOLS=true. When false, the /api/dev routes don't exist (404). */
  readonly enabled: boolean;
  /** Called for every stored reading: remembers which devices are the simulator. */
  noteTelemetry(deviceId: string, simulator: boolean | undefined): void;
  /** Devices that sent simulator readings in the last 30 s. */
  simulatedDevices(): string[];
  /** Tells the simulator of `deviceId` to run a scenario (heat wave, dry soil, back to normal). */
  simulate(deviceId: string, scenario: SimScenario): void;
}

interface Deps {
  enabled: boolean;
  /** Scenarios travel like any device command: in the response to the next reading. */
  commands: Pick<PendingCommands, 'enqueue'>;
  /** Injected in tests. */
  clock?: () => number;
}

/**
 * Support for the app's dev-only "Presentation tools". A scenario is only ever
 * queued for a device whose readings say `simulator: true`, as the command type
 * `simulate` that the real firmware ignores, so it can never change the real
 * greenhouse or inject fake readings into your history.
 */
export function createDevTools({ enabled, commands, clock = Date.now }: Deps): DevTools {
  const lastSimulated = new Map<string, number>();
  return {
    enabled,
    noteTelemetry(deviceId, simulator) {
      if (!enabled) return;
      if (simulator === true) lastSimulated.set(deviceId, clock());
      else lastSimulated.delete(deviceId); // real hardware took over this id
    },
    simulatedDevices() {
      const now = clock();
      return [...lastSimulated]
        .filter(([, t]) => now - t <= SIM_FRESH_MS)
        .map(([id]) => id)
        .sort();
    },
    simulate(deviceId, scenario) {
      commands.enqueue(deviceId, {
        id: randomUUID(),
        type: 'simulate',
        scenario,
        issuedAt: new Date(clock()).toISOString(),
      });
      log.info(`${deviceId} <- scenario ${scenario} (with its next reading)`);
    },
  };
}
