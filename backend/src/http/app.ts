import express, { type Express, type RequestHandler } from 'express';
import { prisma } from '../db.js';
import type { DevTools } from '../dev/devTools.js';
import type { PendingCommands } from '../ingest/commands.js';
import type { Ingest } from '../ingest/ingest.js';
import { createLogger } from '../lib/logger.js';
import type { PushSender } from '../push/sender.js';
import type { Realtime } from '../realtime/socket.js';
import type { SmsNotifier } from '../sms/notifier.js';
import { corsMiddleware } from './cors.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { alertsRouter } from './routes/alerts.js';
import { devRouter } from './routes/dev.js';
import { devicesRouter } from './routes/devices.js';
import { notificationsRouter } from './routes/notifications.js';
import { readingsRouter, statsRouter } from './routes/readings.js';
import { smsRouter } from './routes/sms.js';
import { thresholdsRouter } from './routes/thresholds.js';

const log = createLogger('http');
const startedAt = Date.now();

/** A database check that never takes long (a suspended Neon compute wakes in ~1 s). */
const DB_CHECK_TIMEOUT_MS = 3_000;

export interface AppConfig {
  /** DEVICE_API_KEY: required as X-Device-Key on POST /api/readings. */
  deviceApiKey: string;
  /** ADMIN_API_KEY: required as X-Admin-Key on POST /api/alerts/test (unset = 503). */
  adminApiKey: string | undefined;
  /** CORS_ORIGIN entries (browser origins of the web app). */
  corsOrigins: readonly string[];
  /** DEFAULT_DEVICE_ID. */
  defaultDeviceId: string;
}

export interface AppDeps {
  ingest: Ingest;
  commands: PendingCommands;
  push: PushSender;
  sms: SmsNotifier;
  devTools: DevTools;
  realtime: Realtime;
  config: AppConfig;
}

async function databaseStatus(): Promise<'ok' | 'error'> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'error'>((resolve) => {
    timer = setTimeout(() => {
      resolve('error');
    }, DB_CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      prisma.$queryRaw`SELECT 1`.then(() => 'ok' as const),
      timeout,
    ]);
  } catch {
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One structured line per request: method, path (no query string, no headers or
 * bodies, so keys never reach the log), status and duration. Routine traffic
 * (GETs, readings, /health) logs at debug level; changes at info; errors at warn/error.
 */
const requestLog: RequestHandler = (req, res, next) => {
  const started = performance.now();
  res.on('finish', () => {
    const fields = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Math.round(performance.now() - started),
    };
    const line = `${fields.method} ${fields.path} ${fields.status} ${fields.ms} ms`;
    const routine =
      req.method === 'GET' ||
      req.method === 'OPTIONS' ||
      (req.method === 'POST' && req.path === '/api/readings');
    if (res.statusCode >= 500) log.error(line, fields);
    else if (res.statusCode >= 400) log.warn(line, fields);
    else if (routine) log.debug(line, fields);
    else log.info(line, fields);
  });
  next();
};

export function createApp(deps: AppDeps): Express {
  const { ingest, commands, push, sms, devTools, realtime, config } = deps;
  const app = express();
  app.disable('x-powered-by');
  // Render (and Vercel's proxy, for the web app) sit in front: trust one proxy hop.
  app.set('trust proxy', 1);
  app.use(requestLog);
  // Before the body parser, so preflight requests are answered right away.
  app.use(corsMiddleware(config.corsOrigins));
  app.use(express.json({ limit: '16kb' }));

  const uptimeSec = () => Math.round((Date.now() - startedAt) / 1000);

  // Render's health check: always 200 while the process runs (a database outage
  // must not make Render restart the service in a loop); `db` reports the database.
  app.get('/health', async (_req, res) => {
    const db = await databaseStatus();
    res.json({
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      time: new Date().toISOString(),
      uptimeSec: uptimeSec(),
    });
  });

  // The app's connection check: 503 when the database fails.
  app.get('/api/health', async (_req, res) => {
    const db = await databaseStatus();
    res.status(db === 'ok' ? 200 : 503).json({
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      uptimeSec: uptimeSec(),
      devTools: devTools.enabled,
      time: new Date().toISOString(),
    });
  });

  app.use(
    '/api/readings',
    readingsRouter({
      ingest,
      deviceApiKey: config.deviceApiKey,
      defaultDeviceId: config.defaultDeviceId,
    }),
  );
  app.use('/api/stats', statsRouter({ defaultDeviceId: config.defaultDeviceId }));
  app.use('/api/thresholds', thresholdsRouter({ defaultDeviceId: config.defaultDeviceId }));
  app.use('/api/devices', devicesRouter(commands, realtime));
  app.use('/api/alerts', alertsRouter(sms, config.adminApiKey));
  app.use('/api/sms', smsRouter(sms));
  if (devTools.enabled) app.use('/api/dev', devRouter(devTools));
  app.use('/api', notificationsRouter(push));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
