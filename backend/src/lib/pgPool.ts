import pg from 'pg';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * node-postgres pool settings for DATABASE_URL.
 *
 * - A database on this machine (tests, local dev) uses plain TCP unless the URL
 *   asks for TLS.
 * - Every other database (Neon) ALWAYS uses TLS with certificate verification,
 *   whatever the URL says. The URL's `sslmode`/`channel_binding` options are
 *   applied here instead (pg would otherwise warn that it treats
 *   `sslmode=require` as `verify-full`).
 */
export function poolConfig(url: string): pg.PoolConfig {
  const parsed = new URL(url);
  const sslmode = parsed.searchParams.get('sslmode');
  const base = {
    max: 5, // one small instance: plenty, and well under Neon's connection limits
    connectionTimeoutMillis: 10_000, // a suspended Neon compute wakes up in ~1 s
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: true, // idle connections never keep the process (or a test run) alive
  };
  if (sslmode === 'disable' || (LOCAL_HOSTS.has(parsed.hostname) && sslmode === null)) {
    return { ...base, connectionString: url };
  }
  parsed.searchParams.delete('sslmode');
  parsed.searchParams.delete('channel_binding');
  return {
    ...base,
    connectionString: parsed.toString(),
    ssl: { rejectUnauthorized: true },
    // SCRAM-SHA-256-PLUS when the server offers it (Neon does).
    enableChannelBinding: true,
  };
}

/**
 * The connection pool. Every new connection switches to UTC before its first
 * query: @prisma/adapter-pg (7.x) writes DateTime values as UTC wall-clock text
 * without an offset and reads timestamptz values back as if they were UTC, so
 * both are only right in a UTC session. Neon defaults to UTC, but PostgreSQL
 * installed on Windows takes the PC's zone (Asia/Manila): every stored time
 * would be 8 h early and the history/heatmap buckets shifted. `SET TIME ZONE`,
 * unlike a startup `options` parameter, also works through a pooler such as
 * Neon's PgBouncer, which tracks TimeZone per client.
 */
export function createPool(url: string, onSetupError: (err: unknown) => void): pg.Pool {
  const pool = new pg.Pool(poolConfig(url));
  pool.on('connect', (client) => {
    // A connection runs its queries in order: this one goes before the caller's.
    client.query("SET TIME ZONE 'UTC'").catch(onSetupError);
  });
  return pool;
}
