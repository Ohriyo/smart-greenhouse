import { Router } from 'express';
import type { NotificationSettings, PushToken } from '../../generated/prisma/client.js';
import {
  ExpoPushTokenSchema,
  NotificationSettingsBodySchema,
  PushTestBodySchema,
  PushTokenBodySchema,
  SeveritySchema,
} from '../../domain/schemas.js';
import type { PushSender } from '../../push/sender.js';
import {
  deletePushToken,
  getNotificationSettings,
  updateNotificationSettings,
  upsertPushToken,
} from '../../services/notifications.js';

function toPushTokenDto(t: PushToken) {
  return {
    token: t.token,
    platform: t.platform,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function toSettingsDto(s: NotificationSettings) {
  return {
    enabled: s.enabled,
    minSeverity: SeveritySchema.catch('warning').parse(s.minSeverity),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Push tokens (/api/push-tokens) and notification preferences (/api/notifications). */
export function notificationsRouter(push: PushSender): Router {
  const router = Router();

  // Called by the app on every start and whenever its token changes. Idempotent.
  router.post('/push-tokens', async (req, res) => {
    const body = PushTokenBodySchema.parse(req.body);
    const { pushToken, created } = await upsertPushToken(body.token, body.platform);
    res.status(created ? 201 : 200).json(toPushTokenDto(pushToken));
  });

  // The token contains "[" and "]": the app sends it URL-encoded.
  router.delete('/push-tokens/:token', async (req, res) => {
    const token = ExpoPushTokenSchema.parse(req.params.token);
    await deletePushToken(token);
    res.status(204).end();
  });

  router.get('/notifications/settings', async (_req, res) => {
    res.json(toSettingsDto(await getNotificationSettings()));
  });

  router.put('/notifications/settings', async (req, res) => {
    const body = NotificationSettingsBodySchema.parse(req.body);
    res.json(toSettingsDto(await updateNotificationSettings(body)));
  });

  // Setup check: sends a test push to every registered phone, ignoring preferences.
  router.post('/notifications/test', async (req, res) => {
    // The body is optional (older apps send none). { preset: "demo" } = the prototype's sample alert.
    const { preset } = PushTestBodySchema.parse(req.body ?? {});
    res.json(await push.sendTest(preset));
  });

  return router;
}
