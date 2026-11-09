import type { SimScenario } from './scenarios.js';
import { createLogger } from '../lib/logger.js';
import { topics } from '../mqtt/topics.js';

const log = createLogger('dev');

/** A device counts as "simulated" while simulator telemetry keeps arriving. */
export const SIM_FRESH_MS = 30_000;

export interface DevTools {
  /** DEV_TOOLS=true. When false, the /api/dev routes don't exist (404). */
  readonly enabled: boolean;
  /** Called for every valid telemetry: remembers which devices are the simulator. */
  noteTelemetry(deviceId: string, simulator: boolean | undefined): void;
  /** Devices that sent simulator telemetry in the last 30 s. */
  simulatedDevices(): string[];
  /** Tells the simulator of `deviceId` to run a scenario (heat wave, dry soil, back to normal). */
  simulate(deviceId: string, scenario: SimScenario): Promise<void>;
}

interface Deps {
  enabled: boolean;
  /** Publishes one MQTT message (QoS 1). */
  publish: (topic: string, payload: string) => Promise<void>;
  /** Injected in tests. */
  clock?: () => number;
}

/**
 * Support for the app's dev-only "Presentation tools". Scenarios go to a separate
 * topic that only the simulator listens to, so they can never change the real
 * firmware or inject fake readings into your history.
 */
export function createDevTools({ enabled, publish, clock = Date.now }: Deps): DevTools {
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
    async simulate(deviceId, scenario) {
      await publish(topics.sim(deviceId), JSON.stringify({ scenario }));
      log.info(`${deviceId} <- scenario ${scenario}`);
    },
  };
}
