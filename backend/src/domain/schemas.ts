import { z } from 'zod';

// ---------- Shared enums ----------

export const FAN_MODES = ['auto', 'on', 'off'] as const;
export const FanModeSchema = z.enum(FAN_MODES);
export type FanMode = z.infer<typeof FanModeSchema>;

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

export const DeviceIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'deviceId must be 1-64 chars of A-Z a-z 0-9 _ -');

// ---------- MQTT payloads (device -> backend) ----------

/** A sensor value; null (or missing) means the sensor read failed. */
const sensor = (min: number, max: number) =>
  z
    .number()
    .min(min)
    .max(max)
    .nullish()
    .transform((v) => v ?? null);

/**
 * greenhouse/{deviceId}/telemetry
 * Unknown keys are ignored (stripped). There is no soil temperature sensor.
 */
export const TelemetrySchema = z.object({
  /** Device time in epoch milliseconds (optional; needs NTP on the ESP32). */
  ts: z.number().int().positive().optional(),
  airTemp: sensor(-40, 80),
  humidity: sensor(0, 100),
  soilMoisture: sensor(0, 100),
  soilRaw: z
    .number()
    .int()
    .min(0)
    .max(4095)
    .nullish()
    .transform((v) => v ?? null),
  lux: sensor(0, 200_000),
  fanOn: z.boolean(),
  fanMode: FanModeSchema,
  rssi: z
    .number()
    .int()
    .min(-127)
    .max(0)
    .nullish()
    .transform((v) => v ?? null),
  /** Seconds between telemetry messages; used for offline detection (3 missed intervals). */
  intervalSec: z.number().int().min(1).max(3600).optional(),
});
export type Telemetry = z.infer<typeof TelemetrySchema>;

/** greenhouse/{deviceId}/status — plain string, retained; Last Will is "offline". */
export const StatusSchema = z.enum(['online', 'offline']);

// ---------- MQTT payloads (backend -> device) ----------

/** Fan hysteresis limits accepted by the device (same rule as the thresholds API). */
export const FAN_TEMP_MIN = 10;
export const FAN_TEMP_MAX = 50;
export const FAN_TEMP_MIN_GAP = 1;

const commandBase = { id: z.string().min(1), issuedAt: z.string() };

/** greenhouse/{deviceId}/command — JSON, QoS 1, not retained. */
export const DeviceCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...commandBase, type: z.literal('setFanMode'), mode: FanModeSchema }),
  z
    .object({
      ...commandBase,
      type: z.literal('setFanThresholds'),
      fanOnTemp: z.number().min(FAN_TEMP_MIN).max(FAN_TEMP_MAX),
      fanOffTemp: z.number().min(FAN_TEMP_MIN).max(FAN_TEMP_MAX),
    })
    .refine((c) => c.fanOnTemp - c.fanOffTemp >= FAN_TEMP_MIN_GAP, {
      message: `fanOffTemp must be at least ${FAN_TEMP_MIN_GAP} °C below fanOnTemp`,
    }),
]);
export type DeviceCommand = z.infer<typeof DeviceCommandSchema>;

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

export const FanCommandBodySchema = z.strictObject({ mode: FanModeSchema });

export const HistoryQuerySchema = z.object({
  metric: HistoryMetricSchema,
  range: HistoryRangeSchema.default('24h'),
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

const fanTemp = z.number().min(FAN_TEMP_MIN).max(FAN_TEMP_MAX);
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
  .superRefine((t, ctx) => {
    if (t.fanOnTemp - t.fanOffTemp < FAN_TEMP_MIN_GAP) {
      ctx.addIssue({
        code: 'custom',
        path: ['fanOffTemp'],
        message: `fanOffTemp must be at least ${FAN_TEMP_MIN_GAP} °C below fanOnTemp`,
      });
    }
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
