import { z } from 'zod';
import { prisma } from '../db.js';
import type { HistoryRange } from '../domain/schemas.js';
import { DAY_MS, HOUR_MS, MANILA_OFFSET_MS, manilaFloor } from './manila.js';

/** Bucket size and count per range: 24 × 1 h, 28 × 6 h, 30 × 1 day (Manila-aligned). */
export const ACTIVITY_BUCKETS: Record<HistoryRange, { sizeMs: number; count: number }> = {
  '24h': { sizeMs: HOUR_MS, count: 24 },
  '7d': { sizeMs: 6 * HOUR_MS, count: 28 },
  '30d': { sizeMs: DAY_MS, count: 30 },
};

export interface FanActivityResult {
  deviceId: string;
  range: HistoryRange;
  from: string;
  to: string;
  bucketSec: number;
  /** Seconds the fan was on in the whole window. */
  totalOnSec: number;
  /** Every bucket, oldest first (zero when the fan was off or there was no data). */
  buckets: { ts: string; onSec: number }[];
}

/** Window [from, to]: `count` Manila-aligned buckets, the last one containing `now`. */
export function activityWindow(
  range: HistoryRange,
  now: number,
): { from: number; sizeMs: number; count: number } {
  const { sizeMs, count } = ACTIVITY_BUCKETS[range];
  return { from: manilaFloor(now, sizeMs) - (count - 1) * sizeMs, sizeMs, count };
}

const num = z.union([z.number(), z.bigint()]).transform(Number);
const RowSchema = z.object({ bucket: num, onMs: num.nullable() });

/**
 * How long the fan was on, per bucket. Time-weighted: each reading with fanOn
 * counts until the next reading, but at most `maxGapMs` (3 telemetry intervals),
 * so a device that went offline while ON doesn't count as running the whole time.
 * A segment is attributed to the bucket it starts in (≤ one interval of error).
 * Relies on Reading.ts stored as epoch ms.
 */
export async function getFanActivity(
  deviceId: string,
  range: HistoryRange,
  intervalSec: number | null,
  now: Date = new Date(),
): Promise<FanActivityResult> {
  const to = now.getTime();
  const { from, sizeMs, count } = activityWindow(range, to);
  const maxGapMs = 3 * (intervalSec ?? 5) * 1000 + 2000;

  const rows = await prisma.$queryRaw<unknown[]>`
    WITH seg AS (
      SELECT "ts", "fanOn", LEAD("ts") OVER (ORDER BY "ts") AS nxt
      FROM "Reading"
      WHERE "deviceId" = ${deviceId} AND "ts" >= ${from} AND "ts" <= ${to}
    )
    SELECT CAST(("ts" + ${MANILA_OFFSET_MS}) / ${sizeMs} AS INTEGER) AS bucket,
           SUM(MIN(COALESCE(nxt, ${to}) - "ts", ${maxGapMs})) AS onMs
    FROM seg
    WHERE "fanOn" = 1
    GROUP BY bucket`;

  const onByBucket = new Map<number, number>();
  for (const r of z.array(RowSchema).parse(rows)) onByBucket.set(r.bucket, r.onMs ?? 0);

  const buckets: FanActivityResult['buckets'] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const start = from + i * sizeMs;
    const key = Math.floor((start + MANILA_OFFSET_MS) / sizeMs);
    // Never more than the bucket's length (or the elapsed part of the current one).
    const cap = Math.min(sizeMs, to - start);
    const onSec = Math.round(Math.min(onByBucket.get(key) ?? 0, Math.max(0, cap)) / 1000);
    total += onSec;
    buckets.push({ ts: new Date(start).toISOString(), onSec });
  }

  return {
    deviceId,
    range,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    bucketSec: sizeMs / 1000,
    totalOnSec: total,
    buckets,
  };
}
