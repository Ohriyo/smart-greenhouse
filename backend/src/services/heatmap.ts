import { z } from 'zod';
import { prisma } from '../db.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AlertMetric } from '../domain/schemas.js';
import { TS_EPOCH_MS } from './history.js';
import { DAY_MS, HOUR_MS, MANILA_OFFSET_MS, manilaDayLabel, manilaFloor } from './manila.js';

export interface HeatmapResult {
  deviceId: string;
  metric: AlertMetric;
  days: number;
  from: string;
  to: string;
  /** Oldest day first; `hours[h]` = average for Manila hour h (null = no data). */
  rows: { date: string; weekday: string; hours: (number | null)[] }[];
}

const num = z.union([z.number(), z.bigint()]).transform(Number);
const RowSchema = z.object({ day: num, hour: num, avg: num });

/**
 * Hourly averages for the last `days` Manila calendar days (today included),
 * e.g. "Temperature by hour, last 7 days".
 */
export async function getHeatmap(
  deviceId: string,
  metric: AlertMetric,
  days: number,
  now: Date = new Date(),
): Promise<HeatmapResult> {
  const to = now.getTime();
  const from = manilaFloor(to, DAY_MS) - (days - 1) * DAY_MS;
  // `metric` is whitelisted by AlertMetricSchema, so using it as an identifier is safe.
  const col = Prisma.raw(`"${metric}"`);

  // Manila-local epoch ms; day = whole days since the epoch, hour = 0–23 within it.
  const local = Prisma.sql`(${TS_EPOCH_MS} + ${MANILA_OFFSET_MS})`;
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT floor(${local} / ${DAY_MS})::bigint AS day,
           floor(mod(${local}, ${DAY_MS}) / ${HOUR_MS})::int AS hour,
           avg(${col})::float8 AS avg
    FROM "Reading"
    WHERE "deviceId" = ${deviceId} AND "ts" >= ${new Date(from)} AND "ts" <= ${new Date(to)}
      AND ${col} IS NOT NULL
    GROUP BY day, hour`;

  const firstDay = Math.floor((from + MANILA_OFFSET_MS) / DAY_MS);
  const grid: HeatmapResult['rows'] = Array.from({ length: days }, (_, i) => ({
    ...manilaDayLabel(from + i * DAY_MS),
    hours: Array.from({ length: 24 }, (): number | null => null),
  }));
  for (const r of z.array(RowSchema).parse(rows)) {
    const row = grid[r.day - firstDay];
    if (row && r.hour >= 0 && r.hour < 24) row.hours[r.hour] = Math.round(r.avg * 100) / 100;
  }

  return {
    deviceId,
    metric,
    days,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    rows: grid,
  };
}
