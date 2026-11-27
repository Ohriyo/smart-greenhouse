import type pg from 'pg';

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
 *
 * Sessions must run in UTC (see the `database_timezone_utc` migration). That is
 * a database default, not a connection option: Neon's pooled connections reject
 * the `options` startup parameter.
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
