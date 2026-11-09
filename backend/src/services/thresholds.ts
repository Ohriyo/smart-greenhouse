import { prisma } from '../db.js';
import type { Thresholds } from '../generated/prisma/client.js';
import type { ThresholdsBody } from '../domain/schemas.js';

/** Returns the device's thresholds, creating defaults if missing. Device must exist. */
export function getThresholds(deviceId: string): Promise<Thresholds> {
  return prisma.thresholds.upsert({
    where: { deviceId },
    create: { deviceId },
    update: {},
  });
}

export function replaceThresholds(deviceId: string, body: ThresholdsBody): Promise<Thresholds> {
  return prisma.thresholds.upsert({
    where: { deviceId },
    create: { deviceId, ...body },
    update: body,
  });
}
