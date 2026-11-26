-- Every session of this database runs in UTC, whatever the server's zone.
-- @prisma/adapter-pg (7.x) writes DateTime values as UTC text without an offset
-- and reads timestamptz values back as UTC, so both are only right in a UTC
-- session: PostgreSQL installed on Windows uses the PC's zone (Asia/Manila), which
-- would store every time 8 h early and shift the history/heatmap buckets.
-- Neon already defaults to UTC (GMT). A database default (not a session SET) also
-- works through Neon's pooled connections. It applies to new connections.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END
$$;
