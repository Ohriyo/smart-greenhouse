import { prisma } from '../db.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('retention');

const DAY_MS = 24 * 60 * 60 * 1000;
/** Rows per DELETE: short transactions, so MQTT ingest isn't blocked for long. */
const BATCH_SIZE = 5_000;
const FIRST_RUN_DELAY_MS = 60_000; // let startup (retained replay, sweeps) settle first

/**
 * Deletes raw readings older than `days` (in batches). Alerts, fan events and
 * thresholds are kept. Returns the number of deleted rows.
 */
export async function pruneReadings(days: number, now = new Date()): Promise<number> {
  // Reading.ts is stored as epoch milliseconds (adapter timestampFormat "unixepoch-ms").
  const cutoffMs = now.getTime() - days * DAY_MS;
  let total = 0;
  for (;;) {
    const deleted = await prisma.$executeRaw`
      DELETE FROM "Reading"
      WHERE "id" IN (SELECT "id" FROM "Reading" WHERE "ts" < ${cutoffMs} LIMIT ${BATCH_SIZE})`;
    total += deleted;
    if (deleted < BATCH_SIZE) break;
    await new Promise((resolve) => setImmediate(resolve)); // let other work run
  }
  return total;
}

/** Runs `pruneReadings` 1 min after start, then once a day. Returns a stop function. */
export function startRetentionJob(days: number): () => void {
  const run = async () => {
    const started = Date.now();
    try {
      const deleted = await pruneReadings(days);
      if (deleted > 0) {
        log.info(
          `deleted ${deleted} reading(s) older than ${days} days in ${Date.now() - started} ms`,
        );
      } else {
        log.debug(`nothing older than ${days} days`);
      }
    } catch (err) {
      log.error('pruning readings failed', err);
    }
  };

  let daily: NodeJS.Timeout | undefined;
  const first = setTimeout(() => {
    void run();
    daily = setInterval(() => void run(), DAY_MS);
    daily.unref();
  }, FIRST_RUN_DELAY_MS);
  first.unref();

  return () => {
    clearTimeout(first);
    clearInterval(daily);
  };
}
