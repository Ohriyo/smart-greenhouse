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
  // Fan thresholds the device reports using (acknowledgement). nullish = older backend.
  reportedFanOnTemp: z.number().nullish(),
  reportedFanOffTemp: z.number().nullish(),
  reportedFanThresholdsAt: isoDate.nullish(),
  // Diagnostics reported in telemetry (contract §1 Device). nullish = older backend.
  rssi: z.number().int().nullish(),
  uptimeSec: z.number().int().nullish(),
  uptimeAt: isoDate.nullish(),
  soilDryMv: z.number().int().nullish(),
  soilWetMv: z.number().int().nullish(),
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
  // The limit that was crossed (breach alerts). nullish = older backend / not applicable.
  limit: z.number().nullish(),
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
  /** Most recent confirmed fan change ("running since …"). */
  lastFanChange: FanStateSchema.nullish(),
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

/** GET /api/devices/:id/fan-activity: seconds on per Manila-aligned bucket. */
export const FanActivitySchema = z.object({
  deviceId: z.string(),
  range: HistoryRangeSchema,
  from: isoDate,
  to: isoDate,
  bucketSec: z.number().int().positive(),
  totalOnSec: z.number().int().nonnegative(),
  buckets: z.array(z.object({ ts: isoDate, onSec: z.number().int().nonnegative() })),
});
export type FanActivity = z.infer<typeof FanActivitySchema>;

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

export const SimulateResponseSchema = z.object({
  deviceId: z.string(),
  scenario: SimScenarioSchema,
  status: z.literal('sent'),
});
export type SimulateResponse = z.infer<typeof SimulateResponseSchema>;

// ---------- SMS alerts (contract §7) ----------

/** International format: "+", then 8–15 digits, the first not 0 (mirrors the backend). */
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export const SmsSettingsSchema = z.object({
  enabled: z.boolean(),
  phone: z.string().nullable(),
  offlineAfterMin: z.number().int(),
  /** "console" = test mode (messages only logged on the backend), "semaphore" = real SMS. */
  provider: z.string(),
  simulated: z.boolean(),
  dailyCap: z.number().int(),
  sentLast24h: z.number().int(),
  last: z
    .object({
      ts: isoDate,
      kind: z.enum(['critical', 'offline', 'closing', 'test']),
      status: z.enum(['sent', 'failed', 'skipped']),
      error: z.string().nullable(),
    })
    .nullable(),
  updatedAt: isoDate,
});
export type SmsSettings = z.infer<typeof SmsSettingsSchema>;

/** PUT /api/sms/settings (full replacement). */
export const SmsSettingsUpdateSchema = z
  .object({
    enabled: z.boolean(),
    phone: z
      .string()
      .regex(E164_PATTERN, 'Enter the number like +63 917 123 4567 or 0917 123 4567')
      .nullable(),
    offlineAfterMin: z.number().int().min(5, 'At least 5 minutes').max(120, 'At most 120 minutes'),
  })
  .superRefine((v, ctx) => {
    if (v.enabled && v.phone === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: 'Enter the owner’s number to turn SMS alerts on',
      });
    }
  });
export type SmsSettingsUpdate = z.infer<typeof SmsSettingsUpdateSchema>;

/** POST /api/sms/test. `simulated` = test mode: only written to the backend log. */
export const SmsTestResultSchema = z.object({
  status: z.enum(['sent', 'failed']),
  error: z.string().nullable(),
  simulated: z.boolean(),
});
export type SmsTestResult = z.infer<typeof SmsTestResultSchema>;

/** PATCH /api/devices/:id: rename the greenhouse (mirrors the backend rules, contract §2). */
export const DeviceRenameSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(40, 'Use at most 40 characters'),
});
export type DeviceRename = z.infer<typeof DeviceRenameSchema>;

/** POST /api/devices/:id/soil-calibration (202: sent, acknowledged by telemetry). */
export const SoilPointSchema = z.enum(['dry', 'wet']);
export type SoilPoint = z.infer<typeof SoilPointSchema>;
export const SoilCalibrationBodySchema = z.object({ point: SoilPointSchema });
export const SoilCalibrationResponseSchema = z.object({
  commandId: z.string(),
  deviceId: z.string(),
  point: SoilPointSchema,
  status: z.literal('sent'),
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

const fanTemp = z
  .number({ error: 'Enter a number' })
  .min(10, 'Must be 10–50 °C')
  .max(50, 'Must be 10–50 °C');
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
    fanOnTemp: fanTemp,
    fanOffTemp: fanTemp,
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
    if (t.fanOnTemp - t.fanOffTemp < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['fanOffTemp'],
        message: 'Must be at least 1 °C below the ON temperature',
      });
    }
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

export const FanCommandSchema = z.object({ mode: FanModeSchema });
export type FanCommand = z.infer<typeof FanCommandSchema>;

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
  'fan:state': FanStateSchema,
  alert: AlertSchema,
} as const;
export type SocketEventName = keyof typeof SocketEventSchemas;
export type SocketEventPayload<E extends SocketEventName> = z.infer<(typeof SocketEventSchemas)[E]>;
