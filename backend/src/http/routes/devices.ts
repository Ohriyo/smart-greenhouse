import { Router } from 'express';
import { toDeviceDto, toReadingDto, toThresholdsDto } from '../../domain/dto.js';
import {
  DeviceIdSchema,
  DeviceRenameBodySchema,
  HeatmapQuerySchema,
  HistoryQuerySchema,
  RecentQuerySchema,
  SoilCalibrationBodySchema,
  ThresholdsBodySchema,
} from '../../domain/schemas.js';
import type { CommandSender } from '../../mqtt/commands.js';
import { getDeviceOr404, listDevices, renameDevice } from '../../services/devices.js';
import type { Realtime } from '../../realtime/socket.js';
import { getHeatmap } from '../../services/heatmap.js';
import { getHistory } from '../../services/history.js';
import { getRecentReadings } from '../../services/recent.js';
import { getLatestReading } from '../../services/readings.js';
import { getThresholds, replaceThresholds } from '../../services/thresholds.js';
import { ApiError } from '../errors.js';

function deviceIdParam(raw: string | undefined): string {
  const parsed = DeviceIdSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(404, 'NOT_FOUND', 'Device not found');
  return parsed.data;
}

export function devicesRouter(commands: CommandSender, getRealtime: () => Realtime | null): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const devices = await listDevices();
    res.json(devices.map(toDeviceDto));
  });

  // Rename (the app's Settings → Device). Other connected phones get device:status.
  router.patch('/:id', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    const { name } = DeviceRenameBodySchema.parse(req.body);
    const updated = await renameDevice(device.id, name);
    const dto = toDeviceDto(updated);
    getRealtime()?.emitDeviceStatus(dto);
    res.json(dto);
  });

  router.get('/:id/latest', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    const reading = await getLatestReading(device.id);
    res.json({
      device: toDeviceDto(device),
      reading: reading ? toReadingDto(reading) : null,
    });
  });

  router.get('/:id/history', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    const query = HistoryQuerySchema.parse(req.query);
    res.json(await getHistory(device.id, query.metric, query.range));
  });

  // Hourly averages per Manila day (History "Temperature by hour").
  router.get('/:id/heatmap', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    const { metric, days } = HeatmapQuerySchema.parse(req.query);
    res.json(await getHeatmap(device.id, metric, days));
  });

  // Raw readings for live charts (sparklines, "last 30 minutes"), oldest first.
  router.get('/:id/recent', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    const { minutes } = RecentQuerySchema.parse(req.query);
    const to = new Date();
    const from = new Date(to.getTime() - minutes * 60_000);
    const readings = await getRecentReadings(device.id, from);
    res.json({
      deviceId: device.id,
      minutes,
      from: from.toISOString(),
      to: to.toISOString(),
      readings: readings.map(toReadingDto),
    });
  });

  router.get('/:id/thresholds', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    res.json(toThresholdsDto(await getThresholds(device.id)));
  });

  router.put('/:id/thresholds', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    const body = ThresholdsBodySchema.parse(req.body);
    // Alert limits are checked by the backend only: nothing is sent to the device.
    const saved = await replaceThresholds(device.id, body);
    res.json({ thresholds: toThresholdsDto(saved) });
  });

  // The device stores its *current* soil reading as 0 % (dry: sensor in air) or
  // 100 % (wet: sensor in water). Acknowledged by soilDryMv/soilWetMv in telemetry.
  router.post('/:id/soil-calibration', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    const { point } = SoilCalibrationBodySchema.parse(req.body);
    if (!device.online) {
      throw new ApiError(409, 'DEVICE_OFFLINE', `Device "${device.id}" is offline`);
    }
    const commandId = await commands.sendSoilCalibration(device.id, point);
    res.status(202).json({ commandId, deviceId: device.id, point, status: 'sent' });
  });

  return router;
}
