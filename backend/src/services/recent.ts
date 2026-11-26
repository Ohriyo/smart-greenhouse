import { prisma } from '../db.js';
import type { Reading } from '../generated/prisma/client.js';
import { thinEvenly } from './thinEvenly.js';

/** Upper bound of returned points (30 min at 5 s = 360; longer windows are thinned). */
export const MAX_RECENT_POINTS = 360;

/** Raw readings since `from`, oldest first, thinned to MAX_RECENT_POINTS. */
export async function getRecentReadings(deviceId: string, from: Date): Promise<Reading[]> {
  const rows = await prisma.reading.findMany({
    where: { deviceId, ts: { gte: from } },
    orderBy: { ts: 'asc' },
  });
  return thinEvenly(rows, MAX_RECENT_POINTS);
}
