import { Router } from 'express';
import type { SmsNotifier } from '../../sms/notifier.js';

/**
 * GET /api/sms/status: read-only SMS configuration (recipients masked) and the
 * newest attempts. Everything is configured in the server environment
 * (ALERT_PHONE_NUMBERS, SMS_DRY_RUN, ...); the test SMS is POST /api/alerts/test.
 */
export function smsRouter(sms: SmsNotifier): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    const s = await sms.status();
    res.json({
      provider: s.provider,
      dryRun: s.dryRun,
      recipients: s.recipients,
      cooldownMinutes: s.cooldownMinutes,
      dailyCap: s.dailyCap,
      offlineAfterMinutes: s.offlineAfterMinutes,
      sentLast24h: s.sentLast24h,
      recent: s.recent.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        kind: r.kind,
        deviceId: r.deviceId,
        alertId: r.alertId,
        sensor: r.sensor,
        condition: r.condition,
        value: r.value,
        threshold: r.threshold,
        message: r.message,
        recipients: r.recipients.split(', '),
        status: r.status,
        providerResponse: r.providerResponse,
      })),
    });
  });

  return router;
}
