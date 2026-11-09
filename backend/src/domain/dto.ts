import type { Alert, Device, FanEvent, Reading, Thresholds } from '../generated/prisma/client.js';
import {
  AlertMetricSchema,
  AlertTypeSchema,
  FanModeSchema,
  SeveritySchema,
  type AlertMetric,
  type AlertType,
  type FanMode,
  type Severity,
} from './schemas.js';

// JSON shapes sent over REST and Socket.IO. Keep in sync with docs/api-contract.md.

export interface DeviceDto {
  id: string;
  name: string;
  online: boolean;
  lastSeen: string | null;
  createdAt: string;
  telemetryIntervalSec: number | null;
}

export interface AlertDto {
  id: number;
  deviceId: string;
  ts: string;
  type: AlertType;
  severity: Severity;
  metric: AlertMetric | null;
  value: number | null;
  message: string;
  readAt: string | null;
}

export interface ReadingDto {
  id: number;
  deviceId: string;
  ts: string;
  airTemp: number | null;
  humidity: number | null;
  soilMoisture: number | null;
  soilRaw: number | null;
  lux: number | null;
  fanOn: boolean;
  fanMode: FanMode;
  rssi: number | null;
}

export interface FanStateDto {
  deviceId: string;
  ts: string;
  fanOn: boolean;
  fanMode: FanMode;
  airTemp: number | null;
}

export interface ThresholdsDto {
  deviceId: string;
  fanOnTemp: number;
  fanOffTemp: number;
  airTempMin: number | null;
  airTempMax: number | null;
  humidityMin: number | null;
  humidityMax: number | null;
  soilMoistureMin: number | null;
  soilMoistureMax: number | null;
  luxMin: number | null;
  luxMax: number | null;
  updatedAt: string;
}

export function toDeviceDto(d: Device): DeviceDto {
  return {
    id: d.id,
    name: d.name,
    online: d.online,
    lastSeen: d.lastSeen?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    telemetryIntervalSec: d.telemetryIntervalSec,
  };
}

export function toAlertDto(a: Alert): AlertDto {
  return {
    id: a.id,
    deviceId: a.deviceId,
    ts: a.ts.toISOString(),
    type: AlertTypeSchema.parse(a.type),
    severity: SeveritySchema.parse(a.severity),
    metric: a.metric === null ? null : AlertMetricSchema.parse(a.metric),
    value: a.value,
    message: a.message,
    readAt: a.readAt?.toISOString() ?? null,
  };
}

export function toReadingDto(r: Reading): ReadingDto {
  return {
    id: r.id,
    deviceId: r.deviceId,
    ts: r.ts.toISOString(),
    airTemp: r.airTemp,
    humidity: r.humidity,
    soilMoisture: r.soilMoisture,
    soilRaw: r.soilRaw,
    lux: r.lux,
    fanOn: r.fanOn,
    fanMode: FanModeSchema.parse(r.fanMode),
    rssi: r.rssi,
  };
}

export function toFanStateDto(e: FanEvent): FanStateDto {
  return {
    deviceId: e.deviceId,
    ts: e.ts.toISOString(),
    fanOn: e.fanOn,
    fanMode: FanModeSchema.parse(e.fanMode),
    airTemp: e.airTemp,
  };
}

export function toThresholdsDto(t: Thresholds): ThresholdsDto {
  return {
    deviceId: t.deviceId,
    fanOnTemp: t.fanOnTemp,
    fanOffTemp: t.fanOffTemp,
    airTempMin: t.airTempMin,
    airTempMax: t.airTempMax,
    humidityMin: t.humidityMin,
    humidityMax: t.humidityMax,
    soilMoistureMin: t.soilMoistureMin,
    soilMoistureMax: t.soilMoistureMax,
    luxMin: t.luxMin,
    luxMax: t.luxMax,
    updatedAt: t.updatedAt.toISOString(),
  };
}
