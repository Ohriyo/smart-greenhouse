import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer loads .env automatically. Variables that are already set
// (Render, the test runner) win: loadEnvFile never overrides them.
if (existsSync('.env')) process.loadEnvFile('.env');

// The Prisma CLI (migrations) should use a DIRECT connection: Neon's pooled URL
// (host with "-pooler") goes through PgBouncer, which Prisma Migrate doesn't
// support. The app itself uses DATABASE_URL (pooled is fine) via src/db.ts.
// A blank DIRECT_URL (left empty in Render or .env) counts as unset.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // `prisma generate` needs no database; migrate commands fail clearly without a URL.
  ...(url ? { datasource: { url } } : {}),
});
