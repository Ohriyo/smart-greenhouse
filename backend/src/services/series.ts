import { z } from 'zod';
import { prisma } from '../db.js';
import type { SeriesRange } from '../domain/schemas.js';
import { TS_EPOCH_MS } from './history.js';

const HOUR_MS = 60 * 60 * 1000;
export const SERIES_RANGE_MS: Record<SeriesRange, number> = {
  '1h': HOUR_MS,
  '24h': 24 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
  '30d': 30 * 24 * HOUR_MS,
};

/** At most ~this many points per response (1h → 10 s buckets, i.e. every raw reading). */
export const SERIES_TARGET_POINTS = 360;

/** Sensors with alert limits, in display order. */
export const SERIES_METRICS = ['airTemp', 'humidity', 'soilMoisture', 'lux'] as const;
type SeriesMetric = (typeof SERIES_METRICS)[number];

export interface SeriesPoint {
  /** Bucket start (ISO). */
  ts: string;
  airTemp: number | null;
  humidity: number | null;
  soilMoisture: number | null;
  lux: number | null;
  /** Readings in the bucket. */
  count: number;
}

export interface SeriesResult {
  /** null when no device has sent anything yet. */
  deviceId: string | null;
  range: SeriesRange;
  from: string;
  to: string;
  bucketMs: number;
  /** Oldest first. Buckets without readings are omitted. */
  points: SeriesPoint[];
}

export interface MetricStats {
  min: number | null;
  max: number | null;
  avg: number | null;
  /** Readings where this sensor had a value. */
  count: number;
}

export interface StatsResult {
  deviceId: string | null;
  range: SeriesRange;
  from: string;
  to: string;
  /** All readings in the window (including failed sensors). */
  count: number;
  stats: Record<SeriesMetric, MetricStats>;
}

// Postgres bigint/numeric may arrive as bigint; avg of no rows is null.
const num = z.union([z.number(), z.bigint()]).transform(Number);
const numOrNull = z.union([z.number(), z.bigint(), z.null()]).transform((v) =>
  v === null ? null : Number(v),
);
const round2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

const SeriesRowSchema = z.object({
  bucket: num,
  airTemp: numOrNull,
  humidity: numOrNull,
  soilMoisture: numOrNull,
  lux: numOrNull,
  count: num,
});

function window(range: SeriesRange, now: Date) {
  const to = now.getTime();
  return { from: to - SERIES_RANGE_MS[range], to };
}

/**
 * Time-ordered history of all four sensors: averages per time bucket (bucket =
 * range / 360, at least 10 s). Buckets are aligned to multiples of bucketMs
 * since the epoch; empty buckets are omitted.
 */
export async function getReadingSeries(
  deviceId: string | null,
  range: SeriesRange,
  now: Date = new Date(),
): Promise<SeriesResult> {
  const { from, to } = window(range, now);
  const bucketMs = Math.max(10_000, Math.ceil(SERIES_RANGE_MS[range] / SERIES_TARGET_POINTS));
  const base = {
    deviceId,
    range,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    bucketMs,
  };
  if (deviceId === null) return { ...base, points: [] };

  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT floor(${TS_EPOCH_MS} / ${bucketMs})::bigint AS bucket,
           avg("airTemp")::float8 AS "airTemp",
           avg("humidity")::float8 AS "humidity",
           avg("soilMoisture")::float8 AS "soilMoisture",
           avg("lux")::float8 AS "lux",
           count(*)::int AS count
    FROM "Reading"
    WHERE "deviceId" = ${deviceId} AND "ts" >= ${new Date(from)} AND "ts" <= ${new Date(to)}
    GROUP BY bucket
    ORDER BY bucket`;

  const points = z
    .array(SeriesRowSchema)
    .parse(rows)
    .map((r) => ({
      ts: new Date(r.bucket * bucketMs).toISOString(),
      airTemp: round2(r.airTemp),
      humidity: round2(r.humidity),
      soilMoisture: round2(r.soilMoisture),
      lux: round2(r.lux),
      count: r.count,
    }));
  return { ...base, points };
}

/** Min / max / average (rounded to 2 decimals) of each sensor over the window. */
export async function getStats(
  deviceId: string | null,
  range: SeriesRange,
  now: Date = new Date(),
): Promise<StatsResult> {
  const { from, to } = window(range, now);
  const empty: MetricStats = { min: null, max: null, avg: null, count: 0 };
  const base = {
    deviceId,
    range,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
  };
  if (deviceId === null) {
    return {
      ...base,
      count: 0,
      stats: { airTemp: empty, humidity: empty, soilMoisture: empty, lux: empty },
    };
  }

  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT count(*)::int AS count,
      min("airTemp")::float8 AS "airTempMin", max("airTemp")::float8 AS "airTempMax",
      avg("airTemp")::float8 AS "airTempAvg", count("airTemp")::int AS "airTempCount",
      min("humidity")::float8 AS "humidityMin", max("humidity")::float8 AS "humidityMax",
      avg("humidity")::float8 AS "humidityAvg", count("humidity")::int AS "humidityCount",
      min("soilMoisture")::float8 AS "soilMoistureMin", max("soilMoisture")::float8 AS "soilMoistureMax",
      avg("soilMoisture")::float8 AS "soilMoistureAvg", count("soilMoisture")::int AS "soilMoistureCount",
      min("lux")::float8 AS "luxMin", max("lux")::float8 AS "luxMax",
      avg("lux")::float8 AS "luxAvg", count("lux")::int AS "luxCount"
    FROM "Reading"
    WHERE "deviceId" = ${deviceId} AND "ts" >= ${new Date(from)} AND "ts" <= ${new Date(to)}`;

  // An aggregate without GROUP BY always returns exactly one row.
  const [first] = z.array(z.record(z.string(), z.unknown())).length(1).parse(rows);
  const row = first ?? {};
  const field = (key: string) => numOrNull.parse(row[key] ?? null);
  const pick = (m: SeriesMetric): MetricStats => ({
    min: round2(field(`${m}Min`)),
    max: round2(field(`${m}Max`)),
    avg: round2(field(`${m}Avg`)),
    count: field(`${m}Count`) ?? 0,
  });
  return {
    ...base,
    count: field('count') ?? 0,
    stats: {
      airTemp: pick('airTemp'),
      humidity: pick('humidity'),
      soilMoisture: pick('soilMoisture'),
      lux: pick('lux'),
    },
  };
}
