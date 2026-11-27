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
  // Diagnostics reported in telemetry (contract §1 Device). nullish = older backend.
  rssi: z.number().int().nullish(),
  uptimeSec: z.number().int().nullish(),
  uptimeAt: isoDate.nullish(),
  soilDryMv: z.number().int().nullish(),
  soilWetMv: z.number().int().nullish(),
  /** How the latest reading arrived: MQTT (through EMQX) or the HTTPS fallback. */
  transport: z.enum(['mqtt', 'https']).nullish(),
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
  rssi: z.number().int().nullable(),
});
export type Reading = z.infer<typeof ReadingSchema>;

export const ThresholdsSchema = z.object({
  deviceId: z.string(),
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

/** Outcome of one SMS attempt (contract §7). */
export const SmsStatusSchema = z.enum([
  'sent',
  'failed',
  'skipped_cooldown',
  'skipped_daily_cap',
  'dry_run',
]);
export type SmsStatus = z.infer<typeof SmsStatusSchema>;

/** The newest SMS attempt for an alert. `detail` says why it wasn't sent (null when sent). */
export const AlertSmsSchema = z.object({
  status: SmsStatusSchema,
  at: isoDate,
  detail: z.string().nullable(),
});
export type AlertSms = z.infer<typeof AlertSmsSchema>;

export const AlertSchema = z.object({
  id: z.number().int(),
  deviceId: z.string(),
  ts: isoDate,
  type: AlertTypeSchema,
  severity: SeveritySchema,
  metric: AlertMetricSchema.nullable(),
  value: nullableNumber,
  // The limit that was crossed (breach alerts). nullish = older backend / not applicable.
  limit: z.number().nullish(),
  message: z.string(),
  readAt: isoDate.nullable(),
  // null = no SMS for this alert (yet); always null in the socket `alert` event.
  sms: AlertSmsSchema.nullish(),
});
export type Alert = z.infer<typeof AlertSchema>;

export const ErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'INVALID_JSON',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'DEVICE_OFFLINE',
  'SMS_NOT_CONFIGURED',
  'NOT_SIMULATED',
  'RATE_LIMITED',
  'NOT_CONFIGURED',
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

/** GET /api/health (200 when the database works, 503 when it doesn't). */
export const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'error']),
  /** The backend's MQTT broker connection ("off" = MQTT not configured). nullish = older backend. */
  mqtt: z.enum(['connected', 'disconnected', 'off']).nullish(),
  uptimeSec: z.number(),
  devTools: z.boolean(),
  time: isoDate,
});
export type Health = z.infer<typeof HealthSchema>;

export const DeviceListSchema = z.array(DeviceSchema);

export const LatestSchema = z.object({
  device: DeviceSchema,
  reading: ReadingSchema.nullable(),
});
export type Latest = z.infer<typeof LatestSchema>;

/** GET /api/devices/:id/recent: raw readings, oldest first (≤ 360). */
export const RecentSchema = z.object({
  deviceId: z.string(),
  minutes: z.number().int(),
  from: isoDate,
  to: isoDate,
  readings: z.array(ReadingSchema),
});
export type Recent = z.infer<typeof RecentSchema>;

/** GET /api/devices/:id/heatmap: hourly averages per Manila day, oldest first. */
export const HeatmapSchema = z.object({
  deviceId: z.string(),
  metric: AlertMetricSchema,
  days: z.number().int(),
  from: isoDate,
  to: isoDate,
  rows: z.array(
    z.object({
      date: z.string(),
      weekday: z.string(),
      hours: z.array(z.number().nullable()).length(24),
    }),
  ),
});
export type Heatmap = z.infer<typeof HeatmapSchema>;

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
});
export type ThresholdsUpdateResponse = z.infer<typeof ThresholdsUpdateResponseSchema>;

// ---------- Dev-only Demo tools (contract §2 "Dev-only endpoints") ----------

export const SimScenarioSchema = z.enum(['heatwave', 'drysoil', 'normal']);
export type SimScenario = z.infer<typeof SimScenarioSchema>;

/** GET /api/dev/status (only exists when the backend runs with DEV_TOOLS=true). */
export const DevStatusSchema = z.object({
  enabled: z.boolean(),
  /** Devices that are the simulator right now (never real hardware). */
  simulated: z.array(z.string()),
});
export type DevStatus = z.infer<typeof DevStatusSchema>;

/** 202: queued as a `simulate` command, applied with the simulator's next reading. */
export const SimulateResponseSchema = z.object({
  deviceId: z.string(),
  scenario: SimScenarioSchema,
  status: z.literal('queued'),
});
export type SimulateResponse = z.infer<typeof SimulateResponseSchema>;

// ---------- SMS alerts (contract §7, configured in the server environment) ----------

/** One SMS attempt (newest first in GET /api/sms/status). Numbers are masked. */
export const SmsAttemptSchema = z.object({
  id: z.number().int(),
  at: isoDate,
  kind: z.enum(['threshold', 'recovery', 'offline', 'online', 'test']),
  deviceId: z.string().nullable(),
  alertId: z.number().int().nullable(),
  sensor: z.string().nullable(),
  condition: z.string(),
  value: nullableNumber,
  threshold: nullableNumber,
  message: z.string(),
  recipients: z.array(z.string()),
  status: SmsStatusSchema,
  providerResponse: z.string().nullable(),
});
export type SmsAttempt = z.infer<typeof SmsAttemptSchema>;

/** GET /api/sms/status: read-only setup and the 10 newest attempts. */
export const SmsStatusInfoSchema = z.object({
  provider: z.string(),
  /** true = SMS_DRY_RUN: attempts are logged on the server, nothing is sent. */
  dryRun: z.boolean(),
  recipients: z.array(z.string()),
  cooldownMinutes: z.number().int(),
  dailyCap: z.number().int(),
  offlineAfterMinutes: z.number().int(),
  sentLast24h: z.number().int(),
  recent: z.array(SmsAttemptSchema),
});
export type SmsStatusInfo = z.infer<typeof SmsStatusInfoSchema>;

/** PATCH /api/devices/:id: rename the greenhouse (mirrors the backend rules, contract §2). */
export const DeviceRenameSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(40, 'Use at most 40 characters'),
});
export type DeviceRename = z.infer<typeof DeviceRenameSchema>;

/**
 * POST /api/devices/:id/soil-calibration (202: published over MQTT at once, or queued
 * for the device's next HTTPS reading; acknowledged by the new soilDryMv/soilWetMv
 * it reports).
 */
export const SoilPointSchema = z.enum(['dry', 'wet']);
export type SoilPoint = z.infer<typeof SoilPointSchema>;
export const SoilCalibrationBodySchema = z.object({ point: SoilPointSchema });
export const SoilCalibrationResponseSchema = z.object({
  commandId: z.string(),
  deviceId: z.string(),
  point: SoilPointSchema,
  status: z.literal('queued'),
  /** "mqtt" = sent to the device now; "queued" = with its next HTTPS reading. */
  delivery: z.enum(['mqtt', 'queued']).nullish(),
});
export type SoilCalibrationResponse = z.infer<typeof SoilCalibrationResponseSchema>;

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

/** GET/PUT /api/notifications/settings (single user: one set of preferences). */
export const NotificationSettingsSchema = z.object({
  enabled: z.boolean(),
  minSeverity: SeveritySchema,
  updatedAt: isoDate,
});
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

/** POST /api/push-tokens response. */
export const PushTokenSchema = z.object({
  token: z.string(),
  platform: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type PushToken = z.infer<typeof PushTokenSchema>;

/** POST /api/notifications/test response. */
export const PushTestResultSchema = z.object({
  tokens: z.number().int(),
  sent: z.number().int(),
  failed: z.number().int(),
  removed: z.number().int(),
});
export type PushTestResult = z.infer<typeof PushTestResultSchema>;

/** Data the backend puts in every alert push (tap → open this route). */
export const PushDataSchema = z.object({
  url: z.literal('/alerts'),
  alertId: z.number().int().optional(),
  deviceId: z.string().optional(),
});

// ---------- REST request bodies (validated before sending) ----------

const limit = (min: number, max: number, unit: string) =>
  z
    .number({ error: 'Enter a number' })
    .min(min, `Must be ${min}–${max} ${unit}`)
    .max(max, `Must be ${min}–${max} ${unit}`)
    .nullable();

const THRESHOLD_PAIRS = [
  ['airTempMin', 'airTempMax'],
  ['humidityMin', 'humidityMax'],
  ['soilMoistureMin', 'soilMoistureMax'],
  ['luxMin', 'luxMax'],
] as const;

/** PUT /api/devices/:id/thresholds: full replacement, null = no limit. */
export const ThresholdsUpdateSchema = z
  .object({
    airTempMin: limit(-40, 80, '°C'),
    airTempMax: limit(-40, 80, '°C'),
    humidityMin: limit(0, 100, '%'),
    humidityMax: limit(0, 100, '%'),
    soilMoistureMin: limit(0, 100, '%'),
    soilMoistureMax: limit(0, 100, '%'),
    luxMin: limit(0, 200_000, 'lx'),
    luxMax: limit(0, 200_000, 'lx'),
  })
  .superRefine((t, ctx) => {
    // Same rules as the backend (contract §1 Thresholds).
    for (const [minKey, maxKey] of THRESHOLD_PAIRS) {
      const min = t[minKey];
      const max = t[maxKey];
      if (min !== null && max !== null && min >= max) {
        ctx.addIssue({
          code: 'custom',
          path: [maxKey],
          message: 'Must be higher than the minimum',
        });
      }
    }
  });
export type ThresholdsUpdate = z.infer<typeof ThresholdsUpdateSchema>;

export const NotificationSettingsUpdateSchema = z.object({
  enabled: z.boolean(),
  minSeverity: SeveritySchema,
});
export type NotificationSettingsUpdate = z.infer<typeof NotificationSettingsUpdateSchema>;

/** GET /api/alerts filters (contract §2). */
export interface AlertsFilter {
  severity?: Severity[];
  unread?: boolean;
}

// ---------- Socket.IO events (contract §3) ----------

/** Server → client events and their payload schemas. */
export const SocketEventSchemas = {
  telemetry: ReadingSchema,
  'device:status': DeviceSchema,
  alert: AlertSchema,
} as const;
export type SocketEventName = keyof typeof SocketEventSchemas;
export type SocketEventPayload<E extends SocketEventName> = z.infer<(typeof SocketEventSchemas)[E]>;
