import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './config/env.js';
import { PrismaClient } from './generated/prisma/client.js';
import { createLogger } from './lib/logger.js';
import { poolConfig } from './lib/pgPool.js';

const log = createLogger('db');

export const prisma = new PrismaClient({
  adapter: new PrismaPg(poolConfig(env.DATABASE_URL), {
    // An idle connection dropped by the server (e.g. Neon suspending its compute).
    // The pool opens a new one for the next query.
    onPoolError: (err) => {
      log.warn('an idle database connection was closed', err);
    },
  }),
});

/** Closes Prisma and its connection pool (shutdown, end of a test run). */
export async function closeDatabase(): Promise<void> {
  await prisma.$disconnect();
}
