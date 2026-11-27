/**
 * Small structured logger.
 *
 * - Production (NODE_ENV=production) or LOG_FORMAT=json: one JSON object per line
 *   (`{"time","level","scope","msg",...}`), easy to search in Render's log view.
 * - Otherwise: readable text lines for the terminal.
 *
 * LOG_LEVEL = debug | info (default) | warn | error. Never pass secrets (API keys,
 * device keys, full phone numbers) to the logger.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): Level {
  const v = process.env.LOG_LEVEL;
  return v === 'debug' || v === 'info' || v === 'warn' || v === 'error' ? v : 'info';
}

/** Read on every call: config/env.ts may load backend/.env after this module. */
function jsonFormat(): boolean {
  const f = process.env.LOG_FORMAT;
  if (f === 'json') return true;
  if (f === 'text') return false;
  return process.env.NODE_ENV === 'production';
}

/** Errors become {name, message, stack}; the rest is passed through. */
function serialize(extra: unknown): unknown {
  if (extra instanceof Error) {
    return { name: extra.name, message: extra.message, stack: extra.stack };
  }
  return extra;
}

function toJsonLine(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
  } catch {
    // Circular data: keep the line, drop the extra.
    return JSON.stringify({ ...record, data: '[unserializable]' });
  }
}

function write(level: Level, scope: string, message: string, extra?: unknown): void {
  if (RANK[level] < RANK[minLevel()]) return;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  const time = new Date().toISOString();

  if (jsonFormat()) {
    const record: Record<string, unknown> = { time, level, scope, msg: message };
    if (extra !== undefined) record[extra instanceof Error ? 'err' : 'data'] = serialize(extra);
    sink(toJsonLine(record));
    return;
  }
  const line = `${time} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  if (extra === undefined) sink(line);
  else sink(line, extra);
}

export interface Logger {
  debug(message: string, extra?: unknown): void;
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, e) => {
      write('debug', scope, m, e);
    },
    info: (m, e) => {
      write('info', scope, m, e);
    },
    warn: (m, e) => {
      write('warn', scope, m, e);
    },
    error: (m, e) => {
      write('error', scope, m, e);
    },
  };
}
