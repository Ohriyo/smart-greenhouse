import { Router } from 'express';
import { toDeviceDto, toReadingDto, toThresholdsDto } from '../../domain/dto.js';
import {
  DeviceIdSchema,
  FanCommandBodySchema,
  HistoryQuerySchema,
  ThresholdsBodySchema,
} from '../../domain/schemas.js';
import type { CommandSender } from '../../mqtt/commands.js';
import { getDeviceOr404, listDevices } from '../../services/devices.js';
import { getHistory } from '../../services/history.js';
import { getLatestReading } from '../../services/readings.js';
import { getThresholds, replaceThresholds } from '../../services/thresholds.js';
import { ApiError } from '../errors.js';

function deviceIdParam(raw: string | undefined): string {
  const parsed = DeviceIdSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(404, 'NOT_FOUND', 'Device not found');
  return parsed.data;
}

export function devicesRouter(commands: CommandSender): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const devices = await listDevices();
    res.json(devices.map(toDeviceDto));
  });

  router.get('/:id/latest', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    const reading = await getLatestReading(device.id);
    res.json({ device: toDeviceDto(device), reading: reading ? toReadingDto(reading) : null });
  });

  router.get('/:id/history', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    const query = HistoryQuerySchema.parse(req.query);
    res.json(await getHistory(device.id, query.metric, query.range));
  });

  router.get('/:id/thresholds', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    res.json(toThresholdsDto(await getThresholds(device.id)));
  });

  router.put('/:id/thresholds', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    const body = ThresholdsBodySchema.parse(req.body);
    const saved = await replaceThresholds(device.id, body);

    // The ESP32 keeps its own copy of the fan thresholds (NVS). Push them now if
    // possible; otherwise they are pushed automatically when the device reconnects.
    let deviceSync: 'sent' | 'pending' = 'pending';
    if (device.online && commands.isBrokerConnected()) {
      await commands.sendFanThresholds(device.id, saved.fanOnTemp, saved.fanOffTemp);
      deviceSync = 'sent';
    }
    res.json({ thresholds: toThresholdsDto(saved), deviceSync });
  });

  router.post('/:id/fan', async (req, res) => {
    const device = await getDeviceOr404(deviceIdParam(req.params.id));
    const { mode } = FanCommandBodySchema.parse(req.body);
    if (!device.online) {
      throw new ApiError(409, 'DEVICE_OFFLINE', `Device "${device.id}" is offline`);
    }
    const commandId = await commands.sendFanMode(device.id, mode);
    // 202: sent, not yet confirmed. Confirmation = the next telemetry / fan:state event.
    res.status(202).json({ commandId, deviceId: device.id, mode, status: 'sent' });
  });

  return router;
}
