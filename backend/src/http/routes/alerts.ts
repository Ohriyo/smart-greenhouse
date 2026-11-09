import { Router } from 'express';
import { z } from 'zod';
import { toAlertDto } from '../../domain/dto.js';
import { AlertsQuerySchema, ReadAllBodySchema } from '../../domain/schemas.js';
import { listAlerts, markAlertRead, markAllAlertsRead } from '../../services/alerts.js';
import { ApiError } from '../errors.js';

const AlertIdSchema = z.coerce.number().int().positive();

export function alertsRouter(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = AlertsQuerySchema.parse(req.query);
    const page = await listAlerts(query);
    res.json({
      items: page.items.map(toAlertDto),
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

  router.post('/:id/read', async (req, res) => {
    const id = AlertIdSchema.safeParse(req.params.id);
    if (!id.success) throw new ApiError(404, 'NOT_FOUND', 'Alert not found');
    res.json(toAlertDto(await markAlertRead(id.data)));
  });

  return router;
}
