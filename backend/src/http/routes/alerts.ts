import { Router } from 'express';
import { z } from 'zod';
import { toAlertDto } from '../../domain/dto.js';
import { AlertsQuerySchema, ReadAllBodySchema } from '../../domain/schemas.js';
import {
  latestSmsByAlert,
  listAlerts,
  markAlertRead,
  markAllAlertsRead,
} from '../../services/alerts.js';
import type { SmsNotifier } from '../../sms/notifier.js';
import { requireKey } from '../auth.js';
import { ApiError } from '../errors.js';

const AlertIdSchema = z.coerce.number().int().positive();

export function alertsRouter(sms: SmsNotifier, adminApiKey: string | undefined): Router {
  const router = Router();

  // Newest first, each with the status of its SMS (sent / failed / skipped / dry run).
  router.get('/', async (req, res) => {
    const query = AlertsQuerySchema.parse(req.query);
    const page = await listAlerts(query);
    const smsByAlert = await latestSmsByAlert(page.items.map((a) => a.id));
    res.json({
      items: page.items.map((a) => toAlertDto(a, smsByAlert.get(a.id) ?? null)),
      nextCursor: page.nextCursor,
      unreadCount: page.unreadCount,
    });
  });

  // Registered before '/:id/read' so "read-all" is never taken for an id.
  router.post('/read-all', async (req, res) => {
    const body = ReadAllBodySchema.parse(req.body ?? {});
    const { updated, readAt } = await markAllAlertsRead(body.deviceId);
    res.json({ updated, readAt: readAt.toISOString() });
  });

  // Pre-demo check: one real test SMS to every ALERT_PHONE_NUMBERS entry (X-Admin-Key).
  router.post('/test', requireKey('X-Admin-Key', adminApiKey, 'ADMIN_API_KEY'), async (_req, res) => {
    const result = await sms.sendTest();
    if (result.outcome === 'no-recipients') {
      throw new ApiError(409, 'SMS_NOT_CONFIGURED', 'ALERT_PHONE_NUMBERS is empty on the server');
    }
    if (result.outcome === 'throttled') {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many test messages (5 per hour). Try again later.');
    }
    const { attempt } = result;
    res.json({
      status: attempt.status,
      dryRun: sms.dryRun,
      recipients: attempt.recipients.split(', '),
      message: attempt.message,
      providerResponse: attempt.providerResponse,
      at: attempt.createdAt.toISOString(),
    });
  });

  router.post('/:id/read', async (req, res) => {
    const id = AlertIdSchema.safeParse(req.params.id);
    if (!id.success) throw new ApiError(404, 'NOT_FOUND', 'Alert not found');
    const alert = await markAlertRead(id.data);
    const smsByAlert = await latestSmsByAlert([alert.id]);
    res.json(toAlertDto(alert, smsByAlert.get(alert.id) ?? null));
  });

  return router;
}
