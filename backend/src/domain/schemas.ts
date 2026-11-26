import { z } from 'zod';
import { SimScenarioNameSchema } from '../dev/scenarios.js';

// ---------- Shared enums ----------

/** Metrics that GET /history can return. */
export const HISTORY_METRICS = [
  'airTemp',
  'humidity',
  'soilMoisture',
  'soilRaw',
  'lux',
  'rssi',
] as const;
export const HistoryMetricSchema = z.enum(HISTORY_METRICS);
export type HistoryMetric = z.infer<typeof HistoryMetricSchema>;

export const HISTORY_RANGES = ['24h', '7d', '30d'] as const;
export const HistoryRangeSchema = z.enum(HISTORY_RANGES);
export type HistoryRange = z.infer<typeof HistoryRangeSchema>;

/** Ranges of GET /api/readings and GET /api/stats. */
export const SERIES_RANGES = ['1h', '24h', '7d', '30d'] as const;
export const SeriesRangeSchema = z.enum(SERIES_RANGES, {
  error: `range must be one of ${SERIES_RANGES.join(', ')}`,
});
export type SeriesRange = z.infer<typeof SeriesRangeSchema>;

export const DeviceIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'deviceId must be 1-64 chars of A-Z a-z 0-9 _ -');

// ---------- POST /api/readings (device -> backend) ----------

/** A required sensor value: a number in range, or null when the sensor read failed. */
const sensor = (name: string, unit: string, min: number, max: number) =>
  z
    .number({ error: `${name} must be a number (${unit}), or null when the sensor failed` })
    .min(min, `${name} must be between ${min} and ${max} ${unit}`)
    .max(max, `${name} must be between ${min} and ${max} ${unit}`)
    .nullable();

/** Optional extra: missing or null both mean "not reported". */
const optionalInt = (min: number, max: number) =>
  z
    .number()
    .int()
    .min(min)
    .max(max)
    .nullish()
    .transform((v) => v ?? null);

/**
 * Body of POST /api/readings. `temperature`, `humidity`, `soilMoisture` and `lux`
 * are required: a number, or null when that sensor failed (never garbage). The
 * air temperature may also be sent as `airTemp` (the name used everywhere else in
 * the API), but not both. Unknown keys are ignored, so newer firmware keeps working.
 * There is no soil temperature sensor.
 */
export const ReadingBodySchema = z
  .object({
    /** Defaults to DEFAULT_DEVICE_ID (single greenhouse). */
    deviceId: DeviceIdSchema.optional(),
    temperature: sensor('temperature', '°C', -40, 80).optional(),
    airTemp: sensor('airTemp', '°C', -40, 80).optional(),
    humidity: sensor('humidity', '%', 0, 100),
    soilMoisture: sensor('soilMoisture', '%', 0, 100),
    lux: sensor('lux', 'lx', 0, 200_000),
    /** Raw soil sensor output in mV (diagnostics). */
    soilRaw: optionalInt(0, 4095),
    /** Wi-Fi signal (dBm). */
    rssi: optionalInt(-127, 0),
    /** Device time in epoch milliseconds (needs NTP); only used when plausible. */
    ts: z.number().int().positive().optional(),
    /** Seconds between readings; drives offline detection (3 missed intervals). */
    intervalSec: z.number().int().min(1).max(3600).optional(),
    /** Seconds since the device booted (a drop means it rebooted). */
    uptimeSec: z.number().int().min(0).optional(),
    /** Soil calibration in use (mV in air / in water); acknowledges calibrateSoil. */
    soilDryMv: z.number().int().min(0).max(4095).optional(),
    soilWetMv: z.number().int().min(0).max(4095).optional(),
    /** Failing sensors, e.g. ["dht"]. Their values are null. Logged when the set changes. */
    errors: z.array(z.string().max(32)).max(10).optional(),
    /** Dev-only: true when sent by the simulator, not real hardware. */
    simulator: z.boolean().optional(),
  })
  .superRefine((b, ctx) => {
    if (b.temperature === undefined && b.airTemp === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['temperature'],
        message: 'temperature is required (°C, or null when the sensor failed)',
      });
    }
    if (b.temperature !== undefined && b.airTemp !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['airTemp'],
        message: 'send either temperature or airTemp, not both',
      });
    }
  })
  .transform(({ temperature, airTemp, ...rest }) => ({
    ...rest,
    airTemp: temperature ?? airTemp ?? null,
  }));
export type ReadingBody = z.infer<typeof ReadingBodySchema>;

// ---------- Commands (backend -> device, in the POST /api/readings response) ----------

const commandBase = { id: z.string().min(1), issuedAt: z.string() };

/**
 * Queued by the backend and returned in the device's next POST /api/readings
 * response. A device ignores types it doesn't know (the real firmware never
 * gets `simulate`: it is only queued for the dev simulator).
 */
export const DeviceCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...commandBase, type: z.literal('calibrateSoil'), point: z.enum(['dry', 'wet']) }),
  z.object({ ...commandBase, type: z.literal('simulate'), scenario: SimScenarioNameSchema }),
]);
export type DeviceCommand = z.infer<typeof DeviceCommandSchema>;

/** True if the text contains a control character (newline, tab, DEL, ...). */
function hasControlChar(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** International format: "+", then 8–15 digits, the first not 0 (e.g. +639171234567). */
export const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +639171234567');

/** POST /api/notifications/test: optional preset ("demo" = the prototype's sample alert). */
export const PushTestBodySchema = z.strictObject({ preset: z.enum(['demo']).optional() });

/** PUT /api/sms/settings: full replacement. */
export const SmsSettingsBodySchema = z
  .strictObject({
    enabled: z.boolean(),
    phone: PhoneSchema.nullable(),
    /** "Greenhouse offline" SMS after this many minutes without data. */
    offlineAfterMin: z.number().int().min(5).max(120),
  })
  .superRefine((body, ctx) => {
    if (body.enabled && body.phone === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: 'Enter the owner’s number to turn SMS alerts on',
      });
    }
  });

/** PATCH /api/devices/:id: rename the greenhouse (shown as the title in the app). */
export const DeviceRenameBodySchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name')
    .max(40, 'Use at most 40 characters')
    // No control characters (newlines, tabs, ...): the name is shown in titles and push messages.
    .refine((n) => !hasControlChar(n), 'Use letters, numbers and punctuation only'),
});

/** POST /api/devices/:id/soil-calibration */
export const SoilCalibrationBodySchema = z.strictObject({ point: z.enum(['dry', 'wet']) });

// ---------- Alerts ----------

export const ALERT_TYPES = ['above_max', 'below_min', 'recovered', 'offline', 'online'] as const;
export const AlertTypeSchema = z.enum(ALERT_TYPES);
export type AlertType = z.infer<typeof AlertTypeSchema>;

export const SEVERITIES = ['info', 'warning', 'critical'] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

/** Metrics checked by the rules engine (each has a min/max pair in Thresholds). */
export const ALERT_METRICS = ['airTemp', 'humidity', 'soilMoisture', 'lux'] as const;
export const AlertMetricSchema = z.enum(ALERT_METRICS);
export type AlertMetric = z.infer<typeof AlertMetricSchema>;

// ---------- REST request bodies / queries ----------

export const HistoryQuerySchema = z.object({
  metric: HistoryMetricSchema,
  range: HistoryRangeSchema.default('24h'),
});

/**
 * `?deviceId=` of the single-greenhouse endpoints (/api/readings/latest,
 * /api/thresholds). Omitted = DEFAULT_DEVICE_ID, or the first device if that
 * one doesn't exist.
 */
export const DeviceQuerySchema = z.object({ deviceId: DeviceIdSchema.optional() });

/** GET /api/readings and GET /api/stats. */
export const SeriesQuerySchema = z.object({
  deviceId: DeviceIdSchema.optional(),
  range: SeriesRangeSchema.default('24h'),
});

/** GET /api/devices/:id/heatmap query: hourly averages of the last N Manila days. */
export const HeatmapQuerySchema = z.object({
  metric: AlertMetricSchema.default('airTemp'),
  days: z.coerce.number().int().min(1).max(30).default(7),
});

/** GET /api/devices/:id/recent query: raw readings of the last N minutes (1–60). */
export const RecentQuerySchema = z.object({
  minutes: z.coerce.number().int().min(1).max(60).default(30),
});

/** GET /api/alerts query. `severity` accepts a comma-separated list. */
export const AlertsQuerySchema = z.object({
  deviceId: DeviceIdSchema.optional(),
  severity: z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()))
    .pipe(z.array(SeveritySchema).min(1))
    .optional(),
  unread: z.enum(['true', 'false']).optional(),
  cursor: z.string().regex(/^\d+$/, 'cursor must come from nextCursor').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** POST /api/alerts/read-all — optional body. */
export const ReadAllBodySchema = z.strictObject({ deviceId: DeviceIdSchema.optional() });

// ---------- Push notifications ----------

/** "ExponentPushToken[...]" (or the older "ExpoPushToken[...]"), as returned by expo-notifications. */
export const ExpoPushTokenSchema = z
  .string()
  .max(200)
  .regex(/^Expo(nent)?PushToken\[[^\]]+\]$/, 'token must be an Expo push token');

export const PushTokenBodySchema = z.strictObject({
  token: ExpoPushTokenSchema,
  platform: z.literal('android').default('android'),
});

export const NotificationSettingsBodySchema = z.strictObject({
  enabled: z.boolean(),
  /** Alerts below this severity are not pushed (they still appear in the app). */
  minSeverity: SeveritySchema,
});
export type NotificationSettingsBody = z.infer<typeof NotificationSettingsBodySchema>;

const limit = (min: number, max: number) => z.number().min(min).max(max).nullable();

const RANGE_PAIRS = [
  ['airTempMin', 'airTempMax'],
  ['humidityMin', 'humidityMax'],
  ['soilMoistureMin', 'soilMoistureMax'],
  ['luxMin', 'luxMax'],
] as const;

/** PUT /api/devices/:id/thresholds — full replacement; null = no limit. */
export const ThresholdsBodySchema = z
  .strictObject({
    airTempMin: limit(-40, 80),
    airTempMax: limit(-40, 80),
    humidityMin: limit(0, 100),
    humidityMax: limit(0, 100),
    soilMoistureMin: limit(0, 100),
    soilMoistureMax: limit(0, 100),
    luxMin: limit(0, 200_000),
    luxMax: limit(0, 200_000),
  })
  .superRefine((t, ctx) => {
    for (const [minKey, maxKey] of RANGE_PAIRS) {
      const min = t[minKey];
      const max = t[maxKey];
      if (min !== null && max !== null && min >= max) {
        ctx.addIssue({
          code: 'custom',
          path: [minKey],
          message: `${minKey} must be lower than ${maxKey}`,
        });
      }
    }
  });
export type ThresholdsBody = z.infer<typeof ThresholdsBodySchema>;
