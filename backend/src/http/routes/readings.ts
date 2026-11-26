import { Router } from 'express';
import { toDeviceDto, toReadingDto } from '../../domain/dto.js';
import { DeviceQuerySchema, ReadingBodySchema, SeriesQuerySchema } from '../../domain/schemas.js';
import type { Ingest } from '../../ingest/ingest.js';
import { resolveDevice } from '../../services/devices.js';
import { getLatestReading } from '../../services/readings.js';
import { getReadingSeries, getStats } from '../../services/series.js';
import { requireKey } from '../auth.js';

interface ReadingsDeps {
  ingest: Ingest;
  deviceApiKey: string;
  defaultDeviceId: string;
}

/** /api/readings: the ESP32 posts here; the app reads the latest value and history. */
export function readingsRouter({ ingest, deviceApiKey, defaultDeviceId }: ReadingsDeps): Router {
  const router = Router();

  // The ESP32 (or the simulator). 201 once stored; the response carries any
  // commands queued for the device (e.g. soil calibration).
  router.post('/', requireKey('X-Device-Key', deviceApiKey, 'DEVICE_API_KEY'), async (req, res) => {
    const body = ReadingBodySchema.parse(req.body);
    const result = await ingest.ingestReading(body.deviceId ?? defaultDeviceId, body, new Date());
    res.status(201).json(result);
  });

  // { device, reading }; both null before the first reading ever arrives.
  router.get('/latest', async (req, res) => {
    const { deviceId } = DeviceQuerySchema.parse(req.query);
    const device = await resolveDevice(deviceId, defaultDeviceId);
    const reading = device ? await getLatestReading(device.id) : null;
    res.json({
      device: device ? toDeviceDto(device) : null,
      reading: reading ? toReadingDto(reading) : null,
    });
  });

  // Time-ordered history of all sensors (?range=1h|24h|7d|30d, default 24h).
  router.get('/', async (req, res) => {
    const { deviceId, range } = SeriesQuerySchema.parse(req.query);
    const device = await resolveDevice(deviceId, defaultDeviceId);
    res.json(await getReadingSeries(device?.id ?? null, range));
  });

  return router;
}

/** /api/stats: min / max / average per sensor (?range=1h|24h|7d|30d, default 24h). */
export function statsRouter({ defaultDeviceId }: { defaultDeviceId: string }): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    const { deviceId, range } = SeriesQuerySchema.parse(req.query);
    const device = await resolveDevice(deviceId, defaultDeviceId);
    res.json(await getStats(device?.id ?? null, range));
  });
  return router;
}
