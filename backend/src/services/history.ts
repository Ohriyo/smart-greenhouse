import { z } from 'zod';
import { prisma } from '../db.js';
import { Prisma } from '../generated/prisma/client.js';
import type { HistoryMetric, HistoryRange } from '../domain/schemas.js';

const HOUR_MS = 60 * 60 * 1000;
const RANGE_MS: Record<HistoryRange, number> = {
  '24h': 24 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
  '30d': 30 * 24 * HOUR_MS,
};

/** Target number of points per response (actual count is ≤ ~201). */
export const TARGET_POINTS = 200;

export interface HistoryPoint {
  /** Bucket start (ISO). */
  ts: string;
  avg: number;
  min: number;
  max: number;
  /** Number of raw readings in the bucket. */
  count: number;
}

export interface HistoryResult {
  deviceId: string;
  metric: HistoryMetric;
  range: HistoryRange;
  from: string;
  to: string;
  bucketMs: number;
  points: HistoryPoint[];
}

// SQLite may return integers as bigint through the driver adapter.
const num = z.union([z.number(), z.bigint()]).transform(Number);
const RowSchema = z.object({ bucket: num, avg: num, min: num, max: num, count: num });

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Average/min/max per time bucket, computed in SQL. Buckets are aligned to
 * multiples of bucketMs since the epoch; empty buckets are omitted (gaps).
 * Relies on DateTime stored as epoch ms (timestampFormat 'unixepoch-ms').
 */
export async function getHistory(
  deviceId: string,
  metric: HistoryMetric,
  range: HistoryRange,
  now: Date = new Date(),
): Promise<HistoryResult> {
  const rangeMs = RANGE_MS[range];
  const bucketMs = Math.ceil(rangeMs / TARGET_POINTS);
  const to = now.getTime();
  const from = to - rangeMs;
  // `metric` is whitelisted by HistoryMetricSchema, so using it as an identifier is safe.
  const col = Prisma.raw(`"${metric}"`);

  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT CAST("ts" / ${bucketMs} AS INTEGER) AS bucket,
           AVG(${col}) AS avg, MIN(${col}) AS min, MAX(${col}) AS max, COUNT(${col}) AS count
    FROM "Reading"
    WHERE "deviceId" = ${deviceId} AND "ts" >= ${from} AND "ts" <= ${to} AND ${col} IS NOT NULL
    GROUP BY bucket
    ORDER BY bucket`;

  const points = z
    .array(RowSchema)
    .parse(rows)
    .map((r) => ({
      ts: new Date(r.bucket * bucketMs).toISOString(),
      avg: round2(r.avg),
      min: round2(r.min),
      max: round2(r.max),
      count: r.count,
    }));

  return {
    deviceId,
    metric,
    range,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    bucketMs,
    points,
  };
}
