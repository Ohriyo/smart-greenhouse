import { prisma } from '../db.js';
import type { Reading } from '../generated/prisma/client.js';
import type { Telemetry } from '../domain/schemas.js';

const MAX_FUTURE_SKEW_MS = 60_000;
const MAX_PAST_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * Use the device timestamp only when it is plausible (ESP32 without NTP sync
 * reports 1970-ish times). Otherwise use the time the backend received it.
 */
export function pickTimestamp(deviceTs: number | undefined, receivedAt: Date): Date {
  if (deviceTs === undefined) return receivedAt;
  const diff = deviceTs - receivedAt.getTime();
  if (diff > MAX_FUTURE_SKEW_MS || diff < -MAX_PAST_SKEW_MS) return receivedAt;
  return new Date(deviceTs);
}

export function saveReading(deviceId: string, t: Telemetry, ts: Date): Promise<Reading> {
  return prisma.reading.create({
    data: {
      deviceId,
      ts,
      airTemp: t.airTemp,
      humidity: t.humidity,
      soilMoisture: t.soilMoisture,
      soilRaw: t.soilRaw,
      lux: t.lux,
      rssi: t.rssi,
    },
  });
}

export function getLatestReading(deviceId: string): Promise<Reading | null> {
  return prisma.reading.findFirst({ where: { deviceId }, orderBy: { ts: 'desc' } });
}
