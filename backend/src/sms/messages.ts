import type { AlertMetric } from '../domain/schemas.js';
import { MANILA_OFFSET_MS } from '../services/manila.js';

/**
 * SMS texts, e.g. "[Greenhouse] Soil moisture LOW: 18% (min 30%) at 14:32".
 *
 * Rules that keep every alert to ONE message (one credit):
 * - plain ASCII only: characters outside the GSM alphabet (the degree sign, curly
 *   quotes, dashes, emoji) switch the whole SMS to a mode that fits only 70 characters
 * - at most 160 characters
 * - never starts with "TEST" (Semaphore silently drops those)
 * Times are Asia/Manila (UTC+8).
 */
export const SMS_MAX_CHARS = 160;
export const SMS_PREFIX = '[Greenhouse]';

const LABEL: Record<AlertMetric, { name: string; unit: string; decimals: number }> = {
  airTemp: { name: 'Air temp', unit: 'C', decimals: 1 },
  humidity: { name: 'Humidity', unit: '%', decimals: 1 },
  soilMoisture: { name: 'Soil moisture', unit: '%', decimals: 1 },
  lux: { name: 'Light', unit: ' lux', decimals: 0 },
};

/** Plain ASCII: accents are dropped ("Serre Sud"), anything else becomes "?". */
export function asciiOnly(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '?')
    .trim();
}

/** Device name as shown in an SMS: ASCII, at most 20 characters. */
export function smsName(name: string): string {
  const clean = asciiOnly(name);
  return clean.length > 20 ? `${clean.slice(0, 19)}.` : clean;
}

/** "38.4C", "95%", "90000 lux"; trailing ".0" dropped. */
export function formatSmsValue(metric: AlertMetric, value: number): string {
  const { unit, decimals } = LABEL[metric];
  return `${String(Number(value.toFixed(decimals)))}${unit}`;
}

/** "HH:MM" in Asia/Manila (UTC+8, no daylight saving). */
export function manilaClock(ts: number): string {
  return new Date(ts + MANILA_OFFSET_MS).toISOString().slice(11, 16);
}

/** Last line of defence: never exceed one SMS. */
function fit(text: string): string {
  return text.length <= SMS_MAX_CHARS ? text : `${text.slice(0, SMS_MAX_CHARS - 3)}...`;
}

/** "[Greenhouse] Soil moisture LOW: 18% (min 30%) at 14:32" */
export function thresholdMessage(i: {
  metric: AlertMetric;
  condition: 'HIGH' | 'LOW';
  value: number;
  limit: number | null;
  at: number;
}): string {
  const side = i.condition === 'HIGH' ? 'max' : 'min';
  const limit = i.limit === null ? '' : ` (${side} ${formatSmsValue(i.metric, i.limit)})`;
  return fit(
    `${SMS_PREFIX} ${LABEL[i.metric].name} ${i.condition}: ${formatSmsValue(i.metric, i.value)}` +
      `${limit} at ${manilaClock(i.at)}`,
  );
}

/** "[Greenhouse] Soil moisture back to normal: 35% at 15:02" */
export function recoveryMessage(i: { metric: AlertMetric; value: number; at: number }): string {
  return fit(
    `${SMS_PREFIX} ${LABEL[i.metric].name} back to normal: ${formatSmsValue(i.metric, i.value)} ` +
      `at ${manilaClock(i.at)}`,
  );
}

/** "1 h 5 min" / "12 min". */
function duration(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`;
}

/** "[Greenhouse] gh-01 OFFLINE: no data for 12 min (last seen 14:05)" */
export function offlineMessage(i: { name: string; minutes: number; lastSeen: number }): string {
  return fit(
    `${SMS_PREFIX} ${smsName(i.name)} OFFLINE: no data for ${duration(i.minutes)} ` +
      `(last seen ${manilaClock(i.lastSeen)})`,
  );
}

/** "[Greenhouse] gh-01 back ONLINE at 14:20" */
export function onlineMessage(i: { name: string; at: number }): string {
  return fit(`${SMS_PREFIX} ${smsName(i.name)} back ONLINE at ${manilaClock(i.at)}`);
}

/** "[Greenhouse] Test message: SMS alerts are working (14:32)" */
export function testMessage(at: number): string {
  return `${SMS_PREFIX} Test message: SMS alerts are working (${manilaClock(at)})`;
}
