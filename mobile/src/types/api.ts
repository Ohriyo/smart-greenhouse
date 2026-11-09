/**
 * Zod schemas for every backend payload. Mirrors docs/api-contract.md, which
 * is the single source of truth: update both together.
 *
 * Objects are not strict: unknown fields from a newer backend are ignored
 * instead of failing validation. Timestamps stay ISO strings.
 */
import { z } from 'zod';

const isoDate = z.iso.datetime();
const nullableNumber = z.number().nullable();

// ---------- Enums ----------

export const FanModeSchema = z.enum(['auto', 'on', 'off']);
export type FanMode = z.infer<typeof FanModeSchema>;

export const HistoryMetricSchema = z.enum([
  'airTemp',
  'humidity',
  'soilMoisture',
  'soilRaw',
  'lux',
  'rssi',
]);
export type HistoryMetric = z.infer<typeof HistoryMetricSchema>;

export const HistoryRangeSchema = z.enum(['24h', '7d', '30d']);
export type HistoryRange = z.infer<typeof HistoryRangeSchema>;

export const AlertTypeSchema = z.enum(['above_max', 'below_min', 'recovered', 'offline', 'online']);
export type AlertType = z.infer<typeof AlertTypeSchema>;

export const SeveritySchema = z.enum(['info', 'warning', 'critical']);
export type Severity = z.infer<typeof SeveritySchema>;

export const AlertMetricSchema = z.enum(['airTemp', 'humidity', 'soilMoisture', 'lux']);
export type AlertMetric = z.infer<typeof AlertMetricSchema>;

// ---------- Data types (contract §1) ----------

export const DeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  online: z.boolean(),
  lastSeen: isoDate.nullable(),
  createdAt: isoDate,
  telemetryIntervalSec: z.number().int().nullable(),
});
export type Device = z.infer<typeof DeviceSchema>;

/** A stored reading. No soil temperature: the hardware has no such sensor. */
export const ReadingSchema = z.object({
  id: z.number().int(),
  deviceId: z.string(),
  ts: isoDate,
  airTemp: nullableNumber,
  humidity: nullableNumber,
  soilMoisture: nullableNumber,
  soilRaw: z.number().int().nullable(),
  lux: nullableNumber,
  fanOn: z.boolean(),
  fanMode: FanModeSchema,
  rssi: z.number().int().nullable(),
});
export type Reading = z.infer<typeof ReadingSchema>;

export const ThresholdsSchema = z.object({
  deviceId: z.string(),
  fanOnTemp: z.number(),
  fanOffTemp: z.number(),
  airTempMin: nullableNumber,
  airTempMax: nullableNumber,
  humidityMin: nullableNumber,
  humidityMax: nullableNumber,
  soilMoistureMin: nullableNumber,
  soilMoistureMax: nullableNumber,
  luxMin: nullableNumber,
  luxMax: nullableNumber,
  updatedAt: isoDate,
});
export type Thresholds = z.infer<typeof ThresholdsSchema>;

export const FanStateSchema = z.object({
  deviceId: z.string(),
  ts: isoDate,
  fanOn: z.boolean(),
  fanMode: FanModeSchema,
  airTemp: nullableNumber,
});
export type FanState = z.infer<typeof FanStateSchema>;

export const AlertSchema = z.object({
  id: z.number().int(),
  deviceId: z.string(),
  ts: isoDate,
  type: AlertTypeSchema,
  severity: SeveritySchema,
  metric: AlertMetricSchema.nullable(),
  value: nullableNumber,
  message: z.string(),
  readAt: isoDate.nullable(),
});
export type Alert = z.infer<typeof AlertSchema>;

export const ErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'INVALID_JSON',
  'BAD_REQUEST',
  'NOT_FOUND',
  'DEVICE_OFFLINE',
  'BROKER_UNAVAILABLE',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Body of every non-2xx response. `code` is a plain string so new codes don't break parsing. */
export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

// ---------- REST responses (contract §2) ----------

export const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'error']),
  mqtt: z.enum(['connected', 'disconnected']),
  uptimeSec: z.number(),
  time: isoDate,
});
export type Health = z.infer<typeof HealthSchema>;

export const DeviceListSchema = z.array(DeviceSchema);

export const LatestSchema = z.object({
  device: DeviceSchema,
  reading: ReadingSchema.nullable(),
});
export type Latest = z.infer<typeof LatestSchema>;

export const HistoryPointSchema = z.object({
  ts: isoDate,
  avg: z.number(),
  min: z.number(),
  max: z.number(),
  count: z.number().int(),
});
export type HistoryPoint = z.infer<typeof HistoryPointSchema>;

export const HistorySchema = z.object({
  deviceId: z.string(),
  metric: HistoryMetricSchema,
  range: HistoryRangeSchema,
  from: isoDate,
  to: isoDate,
  bucketMs: z.number().int(),
  points: z.array(HistoryPointSchema),
});
export type History = z.infer<typeof HistorySchema>;

export const ThresholdsUpdateResponseSchema = z.object({
  thresholds: ThresholdsSchema,
  deviceSync: z.enum(['sent', 'pending']),
});
export type ThresholdsUpdateResponse = z.infer<typeof ThresholdsUpdateResponseSchema>;

export const FanCommandResponseSchema = z.object({
  commandId: z.string(),
  deviceId: z.string(),
  mode: FanModeSchema,
  status: z.literal('sent'),
});
export type FanCommandResponse = z.infer<typeof FanCommandResponseSchema>;

export const AlertPageSchema = z.object({
  items: z.array(AlertSchema),
  nextCursor: z.string().nullable(),
  unreadCount: z.number().int(),
});
export type AlertPage = z.infer<typeof AlertPageSchema>;

export const ReadAllResponseSchema = z.object({
  updated: z.number().int(),
  readAt: isoDate,
});
export type ReadAllResponse = z.infer<typeof ReadAllResponseSchema>;

// ---------- REST request bodies (validated before sending) ----------

const fanTemp = z.number().min(10).max(50);
const limit = (min: number, max: number) => z.number().min(min).max(max).nullable();

/** PUT /api/devices/:id/thresholds: full replacement, null = no limit. */
export const ThresholdsUpdateSchema = z
  .object({
    fanOnTemp: fanTemp,
    fanOffTemp: fanTemp,
    airTempMin: limit(-40, 80),
    airTempMax: limit(-40, 80),
    humidityMin: limit(0, 100),
    humidityMax: limit(0, 100),
    soilMoistureMin: limit(0, 100),
    soilMoistureMax: limit(0, 100),
    luxMin: limit(0, 200_000),
    luxMax: limit(0, 200_000),
  })
  .refine((t) => t.fanOnTemp - t.fanOffTemp >= 1, {
    path: ['fanOffTemp'],
    message: 'Fan OFF temperature must be at least 1 °C below fan ON temperature',
  });
export type ThresholdsUpdate = z.infer<typeof ThresholdsUpdateSchema>;

export const FanCommandSchema = z.object({ mode: FanModeSchema });
export type FanCommand = z.infer<typeof FanCommandSchema>;

// ---------- Socket.IO events (contract §3) ----------

/** Server → client events and their payload schemas. */
export const SocketEventSchemas = {
  telemetry: ReadingSchema,
  'device:status': DeviceSchema,
  'fan:state': FanStateSchema,
  alert: AlertSchema,
} as const;
export type SocketEventName = keyof typeof SocketEventSchemas;
export type SocketEventPayload<E extends SocketEventName> = z.infer<(typeof SocketEventSchemas)[E]>;
