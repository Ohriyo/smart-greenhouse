import { prisma } from '../db.js';
import type { Reading } from '../generated/prisma/client.js';

const MAX_FUTURE_SKEW_MS = 60_000;
const MAX_PAST_SKEW_MS = 24 * 60 * 60 * 1000;

/** The stored part of a reading (null = sensor failed or not reported). */
export interface SensorValues {
  airTemp: number | null;
  humidity: number | null;
  soilMoisture: number | null;
  soilRaw: number | null;
  lux: number | null;
  rssi: number | null;
}

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

export function saveReading(deviceId: string, v: SensorValues, ts: Date): Promise<Reading> {
  return prisma.reading.create({
    data: {
      deviceId,
      ts,
      airTemp: v.airTemp,
      humidity: v.humidity,
      soilMoisture: v.soilMoisture,
      soilRaw: v.soilRaw,
      lux: v.lux,
      rssi: v.rssi,
    },
  });
}

export function getLatestReading(deviceId: string): Promise<Reading | null> {
  return prisma.reading.findFirst({ where: { deviceId }, orderBy: { ts: 'desc' } });
}
