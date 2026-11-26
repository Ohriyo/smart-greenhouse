import { Router } from 'express';
import { toThresholdsDto } from '../../domain/dto.js';
import { DeviceQuerySchema, ThresholdsBodySchema } from '../../domain/schemas.js';
import { resolveDevice } from '../../services/devices.js';
import { getThresholds, replaceThresholds } from '../../services/thresholds.js';
import { ApiError } from '../errors.js';

/**
 * /api/thresholds: the alert limits of the greenhouse (single-device shortcut for
 * /api/devices/:id/thresholds; ?deviceId= picks another device).
 */
export function thresholdsRouter({ defaultDeviceId }: { defaultDeviceId: string }): Router {
  const router = Router();

  async function deviceIdFor(query: unknown): Promise<string> {
    const { deviceId } = DeviceQuerySchema.parse(query);
    const device = await resolveDevice(deviceId, defaultDeviceId);
    if (!device) {
      throw new ApiError(404, 'NOT_FOUND', 'No device yet: thresholds exist once it sends a reading');
    }
    return device.id;
  }

  router.get('/', async (req, res) => {
    res.json(toThresholdsDto(await getThresholds(await deviceIdFor(req.query))));
  });

  // Full replacement: send every field (null = no limit).
  router.put('/', async (req, res) => {
    const deviceId = await deviceIdFor(req.query);
    const body = ThresholdsBodySchema.parse(req.body);
    res.json({ thresholds: toThresholdsDto(await replaceThresholds(deviceId, body)) });
  });

  return router;
}
