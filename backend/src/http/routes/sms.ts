import { Router } from 'express';
import type { SmsOverview, SmsNotifier } from '../../sms/notifier.js';
import { SmsSettingsBodySchema } from '../../domain/schemas.js';
import { ApiError } from '../errors.js';

function toDto(o: SmsOverview) {
  return {
    enabled: o.settings.enabled,
    phone: o.settings.phone,
    offlineAfterMin: o.settings.offlineAfterMin,
    provider: o.provider.name,
    simulated: o.provider.simulated,
    dailyCap: o.dailyCap,
    sentLast24h: o.sentLast24h,
    last: o.last
      ? {
          ts: o.last.ts.toISOString(),
          kind: o.last.kind,
          status: o.last.status,
          error: o.last.error,
        }
      : null,
    updatedAt: o.settings.updatedAt.toISOString(),
  };
}

/** SMS alerts to the owner: settings and a test message (/api/sms). */
export function smsRouter(sms: SmsNotifier): Router {
  const router = Router();

  router.get('/settings', async (_req, res) => {
    res.json(toDto(await sms.overview()));
  });

  router.put('/settings', async (req, res) => {
    const body = SmsSettingsBodySchema.parse(req.body);
    res.json(toDto(await sms.saveSettings(body)));
  });

  // Setup check: one test message to the saved number, whatever the on/off switch says.
  router.post('/test', async (_req, res) => {
    const result = await sms.sendTest();
    if (result.outcome === 'no-phone') {
      throw new ApiError(409, 'SMS_NOT_CONFIGURED', 'Save the owner’s phone number first');
    }
    if (result.outcome === 'throttled') {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many test messages. Try again in an hour.');
    }
    res.json({ status: result.status, error: result.error, simulated: result.simulated });
  });

  return router;
}
