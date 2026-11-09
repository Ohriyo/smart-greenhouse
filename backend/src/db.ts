import path from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { BACKEND_ROOT, env } from './config/env.js';
import { PrismaClient } from './generated/prisma/client.js';

/** Resolve a relative `file:` URL against backend/ so the DB is the same whatever the cwd. */
function resolveSqliteUrl(url: string): string {
  if (!url.startsWith('file:')) return url;
  const file = url.slice('file:'.length);
  if (file === ':memory:' || path.isAbsolute(file)) return url;
  return `file:${path.resolve(BACKEND_ROOT, file)}`;
}

// DateTime columns are stored as integer epoch milliseconds, which lets the
// history endpoint bucket readings in SQL (see services/history.ts).
const adapter = new PrismaBetterSqlite3(
  { url: resolveSqliteUrl(env.DATABASE_URL) },
  { timestampFormat: 'unixepoch-ms' },
);

export const prisma = new PrismaClient({ adapter });
