import { prisma } from '../db.js';
import type { Reading } from '../generated/prisma/client.js';

/** Upper bound of returned points (30 min at 5 s = 360; longer windows are thinned). */
export const MAX_RECENT_POINTS = 360;

/**
 * Keeps at most `max` items, evenly spaced, always including the first and the
 * last one (the newest reading must never be dropped). Pure: unit-tested.
 */
export function thinEvenly<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  if (max <= 1) return items.length ? [items[items.length - 1] as T] : [];
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)] as T);
  return out;
}

/** Raw readings since `from`, oldest first, thinned to MAX_RECENT_POINTS. */
export async function getRecentReadings(deviceId: string, from: Date): Promise<Reading[]> {
  const rows = await prisma.reading.findMany({
    where: { deviceId, ts: { gte: from } },
    orderBy: { ts: 'asc' },
  });
  return thinEvenly(rows, MAX_RECENT_POINTS);
}
