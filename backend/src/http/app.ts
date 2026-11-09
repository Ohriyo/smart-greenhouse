import express, { type Express } from 'express';
import { prisma } from '../db.js';
import type { CommandSender } from '../mqtt/commands.js';
import type { PushSender } from '../push/sender.js';
import type { Realtime } from '../realtime/socket.js';
import type { DevTools } from '../dev/devTools.js';
import type { SmsNotifier } from '../sms/notifier.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { alertsRouter } from './routes/alerts.js';
import { devRouter } from './routes/dev.js';
import { devicesRouter } from './routes/devices.js';
import { notificationsRouter } from './routes/notifications.js';
import { smsRouter } from './routes/sms.js';

const startedAt = Date.now();

export interface AppDeps {
  commands: CommandSender;
  push: PushSender;
  sms: SmsNotifier;
  devTools: DevTools;
  /**
   * A lookup because the Socket.IO server is created from the HTTP server, which in
   * turn needs this app first.
   */
  getRealtime: () => Realtime | null;
}

export function createApp({ commands, push, sms, devTools, getRealtime }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', async (_req, res) => {
    let db: 'ok' | 'error' = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    const mqtt = commands.isBrokerConnected() ? 'connected' : 'disconnected';
    res.status(db === 'ok' ? 200 : 503).json({
      status: db === 'ok' && mqtt === 'connected' ? 'ok' : 'degraded',
      db,
      mqtt,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      devTools: devTools.enabled,
      time: new Date().toISOString(),
    });
  });

  app.use('/api/devices', devicesRouter(commands, getRealtime));
  app.use('/api/alerts', alertsRouter());
  app.use('/api/sms', smsRouter(sms));
  if (devTools.enabled) app.use('/api/dev', devRouter(devTools));
  app.use('/api', notificationsRouter(push));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
