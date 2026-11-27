import type { Alert, Device, Reading, Thresholds } from '../generated/prisma/client.js';
import type { SmsAlertRow, SmsStatus } from '../sms/store.js';
import {
  AlertMetricSchema,
  AlertTypeSchema,
  SeveritySchema,
  type AlertMetric,
  type AlertType,
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
  /** Latest Wi-Fi signal (dBm) the device reported; null if never. */
  rssi: number | null;
  /** Seconds since boot as reported at `uptimeAt` (uptime now ≈ uptimeSec + (now − uptimeAt)). */
  uptimeSec: number | null;
  uptimeAt: string | null;
  /** Soil calibration the device reports using (mV); null if never reported. */
  soilDryMv: number | null;
  soilWetMv: number | null;
  /** How the latest reading arrived: "mqtt" (broker) or "https" (fallback); null before any. */
  transport: 'mqtt' | 'https' | null;
}

/** The SMS sent for an alert (newest attempt). */
export interface AlertSmsDto {
  status: SmsStatus;
  at: string;
  /** Why it was not sent (failed / skipped / dry run); null when sent. */
  detail: string | null;
}

export interface AlertDto {
  id: number;
  deviceId: string;
  ts: string;
  type: AlertType;
  severity: Severity;
  metric: AlertMetric | null;
  value: number | null;
  /** The limit that was crossed (breach alerts); null for recovered/offline/online and old alerts. */
  limit: number | null;
  message: string;
  readAt: string | null;
  /** null = no SMS for this alert (not a texted situation, SMS off, or not processed yet). */
  sms: AlertSmsDto | null;
}

export function toAlertSmsDto(row: SmsAlertRow): AlertSmsDto {
  let detail: string | null = null;
  if (row.status === 'dry_run') detail = 'SMS_DRY_RUN is on: logged, not sent';
  else if (row.status !== 'sent') detail = (row.providerResponse ?? '').slice(0, 200) || null;
  return { status: row.status, at: row.createdAt.toISOString(), detail };
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
  rssi: number | null;
}

export interface ThresholdsDto {
  deviceId: string;
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
    rssi: d.rssi,
    uptimeSec: d.uptimeSec,
    uptimeAt: d.uptimeAt?.toISOString() ?? null,
    soilDryMv: d.soilDryMv,
    soilWetMv: d.soilWetMv,
    transport: d.transport === 'mqtt' || d.transport === 'https' ? d.transport : null,
  };
}

export function toAlertDto(a: Alert, sms: SmsAlertRow | null = null): AlertDto {
  return {
    id: a.id,
    deviceId: a.deviceId,
    ts: a.ts.toISOString(),
    type: AlertTypeSchema.parse(a.type),
    severity: SeveritySchema.parse(a.severity),
    metric: a.metric === null ? null : AlertMetricSchema.parse(a.metric),
    value: a.value,
    limit: a.limitValue,
    message: a.message,
    readAt: a.readAt?.toISOString() ?? null,
    sms: sms ? toAlertSmsDto(sms) : null,
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
    rssi: r.rssi,
  };
}

export function toThresholdsDto(t: Thresholds): ThresholdsDto {
  return {
    deviceId: t.deviceId,
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
