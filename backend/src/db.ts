import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './config/env.js';
import { PrismaClient } from './generated/prisma/client.js';
import { createLogger } from './lib/logger.js';
import { createPool } from './lib/pgPool.js';

const log = createLogger('db');

/** Connection pool for DATABASE_URL (TLS for Neon, sessions in UTC: see ./lib/pgPool.ts). */
export const pool = createPool(env.DATABASE_URL, (err) => {
  log.error('could not switch a database connection to UTC', err);
});

export const prisma = new PrismaClient({
  adapter: new PrismaPg(pool, {
    // An idle connection dropped by the server (e.g. Neon suspending its compute).
    // The pool replaces it on the next query; without a listener it would crash the process.
    onPoolError: (err) => {
      log.warn('an idle database connection was closed', err);
    },
  }),
});

/** Closes Prisma and the pool (shutdown). */
export async function closeDatabase(): Promise<void> {
  await prisma.$disconnect();
  await pool.end();
}
