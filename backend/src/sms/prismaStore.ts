import { prisma } from '../db.js';
import { DELIVERED, toSmsAlertRow, type SmsQuery, type SmsStore } from './store.js';

function where(q: SmsQuery) {
  return { deviceId: q.deviceId, sensor: q.sensor, condition: { in: [...q.conditions] } };
}
const NEWEST = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

/** The SMS log in PostgreSQL (table SmsAlert). */
export function createPrismaSmsStore(): SmsStore {
  return {
    async record(row) {
      return toSmsAlertRow(await prisma.smsAlert.create({ data: row }));
    },

    async lastDelivered(q) {
      const row = await prisma.smsAlert.findFirst({
        where: { ...where(q), status: { in: [...DELIVERED] } },
        orderBy: NEWEST,
      });
      return row ? toSmsAlertRow(row) : null;
    },

    async lastAttempt(q) {
      const row = await prisma.smsAlert.findFirst({ where: where(q), orderBy: NEWEST });
      return row ? toSmsAlertRow(row) : null;
    },

    countSentSince: (since) =>
      prisma.smsAlert.count({
        where: { status: 'sent', kind: { not: 'test' }, createdAt: { gte: since } },
      }),

    countTestsSince: (since) =>
      prisma.smsAlert.count({ where: { kind: 'test', createdAt: { gte: since } } }),

    async recent(limit) {
      const rows = await prisma.smsAlert.findMany({ orderBy: NEWEST, take: limit });
      return rows.map(toSmsAlertRow);
    },

    listDevices: () =>
      prisma.device.findMany({ select: { id: true, name: true, online: true, lastSeen: true } }),

    async latestAlertId(deviceId, type) {
      const alert = await prisma.alert.findFirst({
        where: { deviceId, type },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      return alert?.id ?? null;
    },
  };
}
