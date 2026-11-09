import { Router } from 'express';
import { z } from 'zod';
import { SimScenarioNameSchema } from '../../dev/scenarios.js';
import type { DevTools } from '../../dev/devTools.js';
import { DeviceIdSchema } from '../../domain/schemas.js';
import { ApiError } from '../errors.js';

const SimulateBodySchema = z.strictObject({
  deviceId: DeviceIdSchema,
  scenario: SimScenarioNameSchema,
});

/** Mounted ONLY when DEV_TOOLS=true (otherwise these paths are plain 404s). */
export function devRouter(devTools: DevTools): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json({ enabled: true, simulated: devTools.simulatedDevices() });
  });

  router.post('/simulate', async (req, res) => {
    const { deviceId, scenario } = SimulateBodySchema.parse(req.body);
    if (!devTools.simulatedDevices().includes(deviceId)) {
      throw new ApiError(
        409,
        'NOT_SIMULATED',
        `"${deviceId}" is not a running simulator. Scenarios only work with the simulator (npm run sim in backend/); the real greenhouse is never changed.`,
      );
    }
    await devTools.simulate(deviceId, scenario);
    res.status(202).json({ deviceId, scenario, status: 'sent' });
  });

  return router;
}
