import express, { type Express } from 'express';
import { prisma } from '../db.js';
import type { CommandSender } from '../mqtt/commands.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { alertsRouter } from './routes/alerts.js';
import { devicesRouter } from './routes/devices.js';

const startedAt = Date.now();

export function createApp(commands: CommandSender): Express {
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
      time: new Date().toISOString(),
    });
  });

  app.use('/api/devices', devicesRouter(commands));
  app.use('/api/alerts', alertsRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
