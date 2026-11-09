import { prisma } from '../db.js';
import type { FanEvent, Reading } from '../generated/prisma/client.js';
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

export interface SavedReading {
  reading: Reading;
  /** Set when fanOn or fanMode differs from the previous reading. */
  fanEvent: FanEvent | null;
}

export async function saveReading(deviceId: string, t: Telemetry, ts: Date): Promise<SavedReading> {
  // Compare with the previously *received* reading (insertion order), not the one
  // with the newest ts: a late message with an older device timestamp must not
  // look like a state change.
  const previous = await prisma.reading.findFirst({
    where: { deviceId },
    orderBy: { id: 'desc' },
    select: { fanOn: true, fanMode: true },
  });

  const reading = await prisma.reading.create({
    data: {
      deviceId,
      ts,
      airTemp: t.airTemp,
      humidity: t.humidity,
      soilMoisture: t.soilMoisture,
      soilRaw: t.soilRaw,
      lux: t.lux,
      fanOn: t.fanOn,
      fanMode: t.fanMode,
      rssi: t.rssi,
    },
  });

  const fanChanged = !previous || previous.fanOn !== t.fanOn || previous.fanMode !== t.fanMode;
  const fanEvent = fanChanged
    ? await prisma.fanEvent.create({
        data: { deviceId, ts, fanOn: t.fanOn, fanMode: t.fanMode, airTemp: t.airTemp },
      })
    : null;

  return { reading, fanEvent };
}

export function getLatestReading(deviceId: string): Promise<Reading | null> {
  return prisma.reading.findFirst({ where: { deviceId }, orderBy: { ts: 'desc' } });
}
