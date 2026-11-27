import { randomUUID } from 'node:crypto';
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
  type DeviceCommand,
} from '../../domain/schemas.js';
import type { CommandRouter } from '../../ingest/commands.js';
import type { Realtime } from '../../realtime/socket.js';
import { getDeviceOr404, listDevices, renameDevice } from '../../services/devices.js';
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

export function devicesRouter(
  commands: Pick<CommandRouter, 'deliver'>,
  realtime: Realtime,
): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const devices = await listDevices();
    res.json(devices.map(toDeviceDto));
  });

  // Rename (the app's Settings → Device). Other connected apps get device:status.
  router.patch('/:id', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    const { name } = DeviceRenameBodySchema.parse(req.body);
    const dto = toDeviceDto(await renameDevice(device.id, name));
    realtime.emitDeviceStatus(dto);
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
  // 100 % (wet: sensor in water). The command is published over MQTT at once when the
  // device is on MQTT, otherwise it goes out in the response to its next HTTPS reading;
  // the new soilDryMv/soilWetMv in a later reading acknowledge it.
  // `status` stays "queued" (not yet applied); `delivery` says which way it went.
  router.post('/:id/soil-calibration', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    const { point } = SoilCalibrationBodySchema.parse(req.body);
    if (!device.online) {
      throw new ApiError(409, 'DEVICE_OFFLINE', `Device "${device.id}" is offline`);
    }
    const command: DeviceCommand = {
      id: randomUUID(),
      type: 'calibrateSoil',
      point,
      issuedAt: new Date().toISOString(),
    };
    const delivery = await commands.deliver(device.id, command);
    res
      .status(202)
      .json({ commandId: command.id, deviceId: device.id, point, status: 'queued', delivery });
  });

  return router;
}
