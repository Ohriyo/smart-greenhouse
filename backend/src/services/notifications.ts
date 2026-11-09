import { prisma } from '../db.js';
import type { NotificationSettings, PushToken } from '../generated/prisma/client.js';
import type { NotificationSettingsBody } from '../domain/schemas.js';

// Single-user app: one settings row (id 1), created with defaults on first use.
const SETTINGS_ID = 1;

export function getNotificationSettings(): Promise<NotificationSettings> {
  return prisma.notificationSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
}

export function updateNotificationSettings(
  body: NotificationSettingsBody,
): Promise<NotificationSettings> {
  return prisma.notificationSettings.upsert({
    where: { id: SETTINGS_ID },
    update: body,
    create: { id: SETTINGS_ID, ...body },
  });
}

/** Insert, or refresh `updatedAt` of an already-known token. Returns whether it was new. */
export async function upsertPushToken(
  token: string,
  platform: string,
): Promise<{ pushToken: PushToken; created: boolean }> {
  const existing = await prisma.pushToken.findUnique({ where: { token } });
  const pushToken = existing
    ? await prisma.pushToken.update({ where: { token }, data: { platform } })
    : await prisma.pushToken.create({ data: { token, platform } });
  return { pushToken, created: !existing };
}

/** Idempotent: returns how many rows were removed (0 or 1). */
export async function deletePushToken(token: string): Promise<number> {
  const { count } = await prisma.pushToken.deleteMany({ where: { token } });
  return count;
}

export async function deletePushTokens(tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  const { count } = await prisma.pushToken.deleteMany({ where: { token: { in: tokens } } });
  return count;
}

export async function listPushTokens(): Promise<string[]> {
  const rows = await prisma.pushToken.findMany({ select: { token: true } });
  return rows.map((r) => r.token);
}
