import { prisma } from '../db.js';
import type { Alert, Prisma } from '../generated/prisma/client.js';
import type { AlertMetric, AlertType, Severity } from '../domain/schemas.js';
import { ApiError } from '../http/errors.js';

export interface NewAlert {
  deviceId: string;
  type: AlertType;
  severity: Severity;
  metric: AlertMetric | null;
  value: number | null;
  message: string;
}

export function insertAlert(a: NewAlert): Promise<Alert> {
  return prisma.alert.create({ data: { ...a, ts: new Date() } });
}

/** Latest breach alert and latest recovered alert of one metric (restores rule state). */
export async function latestMetricAlerts(
  deviceId: string,
  metric: AlertMetric,
): Promise<{ breach: Alert | null; recovered: Alert | null }> {
  const [breach, recovered] = await Promise.all([
    prisma.alert.findFirst({
      where: { deviceId, metric, type: { in: ['above_max', 'below_min'] } },
      orderBy: { id: 'desc' },
    }),
    prisma.alert.findFirst({
      where: { deviceId, metric, type: 'recovered' },
      orderBy: { id: 'desc' },
    }),
  ]);
  return { breach, recovered };
}

export interface AlertListQuery {
  deviceId?: string | undefined;
  severity?: Severity[] | undefined;
  unread?: 'true' | 'false' | undefined;
  cursor?: string | undefined;
  limit: number;
}

export interface AlertPage {
  items: Alert[];
  nextCursor: string | null;
  unreadCount: number;
}

/** Newest first. The cursor is the id of the last item of the previous page. */
export async function listAlerts(q: AlertListQuery): Promise<AlertPage> {
  const where: Prisma.AlertWhereInput = {};
  if (q.deviceId) where.deviceId = q.deviceId;
  if (q.severity) where.severity = { in: q.severity };
  if (q.unread === 'true') where.readAt = null;
  if (q.unread === 'false') where.readAt = { not: null };
  if (q.cursor) where.id = { lt: Number(q.cursor) };

  const [rows, unreadCount] = await Promise.all([
    prisma.alert.findMany({ where, orderBy: { id: 'desc' }, take: q.limit + 1 }),
    prisma.alert.count({
      where: { readAt: null, ...(q.deviceId ? { deviceId: q.deviceId } : {}) },
    }),
  ]);
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? String(last.id) : null,
    unreadCount,
  };
}

/** Idempotent: an already-read alert keeps its original readAt. */
export async function markAlertRead(id: number): Promise<Alert> {
  const alert = await prisma.alert.findUnique({ where: { id } });
  if (!alert) throw new ApiError(404, 'NOT_FOUND', `Alert ${id} not found`);
  if (alert.readAt) return alert;
  return prisma.alert.update({ where: { id }, data: { readAt: new Date() } });
}

export async function markAllAlertsRead(
  deviceId: string | undefined,
): Promise<{ updated: number; readAt: Date }> {
  const readAt = new Date();
  const { count } = await prisma.alert.updateMany({
    where: { readAt: null, ...(deviceId ? { deviceId } : {}) },
    data: { readAt },
  });
  return { updated: count, readAt };
}
