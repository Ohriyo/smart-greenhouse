import { z } from 'zod';

/** Demo scenarios the app's dev-only "Presentation tools" can trigger on the simulator. */
export const SIM_SCENARIOS = ['heatwave', 'drysoil', 'normal'] as const;
export const SimScenarioNameSchema = z.enum(SIM_SCENARIOS);
export type SimScenario = z.infer<typeof SimScenarioNameSchema>;

/** Message on greenhouse/{id}/sim. */
export const SimScenarioSchema = z.object({ scenario: SimScenarioNameSchema });
