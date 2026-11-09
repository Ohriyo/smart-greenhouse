type Level = 'debug' | 'info' | 'warn' | 'error';

const debugEnabled = process.env.LOG_LEVEL === 'debug';

function write(level: Level, scope: string, message: string, extra?: unknown): void {
  if (level === 'debug' && !debugEnabled) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
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
