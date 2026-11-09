import type { AlertMetric, FanMode } from '../domain/schemas.js';
import { MANILA_OFFSET_MS } from '../services/manila.js';

/**
 * SMS texts. Rules that keep every alert at ONE message (and so one credit):
 * - plain ASCII only: characters outside the GSM alphabet (the degree sign, curly
 *   quotes, dashes, emoji) switch the whole message to a mode that fits only 70 characters
 * - at most 160 characters
 * Units are written "C", "%" and "lux" for the same reason.
 */
export const SMS_MAX_CHARS = 160;

const LABEL: Record<AlertMetric, { name: string; unit: string; decimals: number }> = {
  airTemp: { name: 'Air temp', unit: ' C', decimals: 1 },
  humidity: { name: 'Humidity', unit: ' %', decimals: 1 },
  soilMoisture: { name: 'Soil moisture', unit: ' %', decimals: 1 },
  lux: { name: 'Light', unit: ' lux', decimals: 0 },
};

/** The fan as the device last confirmed it (never assumed). */
export interface FanInfo {
  on: boolean;
  mode: FanMode;
}

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

/** "38.4 C", "95 %", "90000 lux"; trailing ".0" dropped. */
export function formatSmsValue(metric: AlertMetric, value: number): string {
  const { unit, decimals } = LABEL[metric];
  return `${String(Number(value.toFixed(decimals)))}${unit}`;
}

/** Last line of defence: never exceed one SMS. */
function fit(text: string): string {
  return text.length <= SMS_MAX_CHARS ? text : `${text.slice(0, SMS_MAX_CHARS - 3)}...`;
}

function fanSentence(fan: FanInfo | null): string {
  if (!fan) return 'Fan state unknown.';
  if (fan.on) return `Fan ON (${fan.mode === 'auto' ? 'auto' : 'manual'}).`;
  // OFF while it is too hot: either held off by hand, or something is wrong.
  return fan.mode === 'off'
    ? 'Fan is OFF (manual). Turn it on in the app!'
    : 'Fan is OFF but should be running. Check it!';
}

interface CriticalInput {
  metric: AlertMetric;
  type: 'above_max' | 'below_min';
  value: number;
  limit: number | null;
  name: string;
  /** Needed for air temperature too hot; ignored otherwise. */
  fan: FanInfo | null;
}

/** "ETanim CRITICAL: Air temp 38.4 C (max 35). Fan ON (auto). Greenhouse 01" */
export function criticalMessage(i: CriticalInput): string {
  const side = i.type === 'above_max' ? 'max' : 'min';
  const limit =
    i.limit === null ? '' : ` (${side} ${formatSmsValue(i.metric, i.limit).replace(/ .*/, '')})`;
  const head = `ETanim CRITICAL: ${LABEL[i.metric].name} ${formatSmsValue(i.metric, i.value)}${limit}.`;
  let tail = '';
  if (i.metric === 'airTemp')
    tail = i.type === 'above_max' ? ` ${fanSentence(i.fan)}` : ' Too cold.';
  return fit(`${head}${tail} ${smsName(i.name)}`);
}

/** Air temperature settled and the fan switched OFF by itself. */
export function stabilizedMessage(i: { value: number | null; name: string }): string {
  const v = i.value === null ? '' : ` to ${formatSmsValue('airTemp', i.value)}`;
  return fit(`ETanim OK: Air temp back${v || ' to normal'}. Fan turned OFF. ${smsName(i.name)}`);
}

/** Air temperature is back in range but the fan is still running (manual, or it took too long). */
export function airTempBackMessage(i: {
  value: number | null;
  name: string;
  fan: FanInfo | null;
}): string {
  const v = i.value === null ? 'normal' : formatSmsValue('airTemp', i.value);
  const fan = i.fan?.on
    ? `Fan still ON (${i.fan.mode === 'auto' ? 'auto' : 'manual'}).`
    : 'Fan is OFF.';
  return fit(`ETanim OK: Air temp back to ${v}. ${fan} ${smsName(i.name)}`);
}

/** Humidity, soil or light back inside its limits. */
export function backInRangeMessage(i: {
  metric: AlertMetric;
  value: number | null;
  name: string;
}): string {
  const v = i.value === null ? '' : `: ${formatSmsValue(i.metric, i.value)}`;
  return fit(`ETanim OK: ${LABEL[i.metric].name} back in range${v}. ${smsName(i.name)}`);
}

/** "1 h 5 min" / "12 min". */
function duration(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`;
}

/** "HH:MM" in Asia/Manila (UTC+8, no daylight saving). */
export function manilaClock(ts: number): string {
  return new Date(ts + MANILA_OFFSET_MS).toISOString().slice(11, 16);
}

export function offlineMessage(i: { name: string; minutes: number; lastSeen: number }): string {
  return fit(
    `ETanim ALERT: ${smsName(i.name)} offline for ${duration(i.minutes)} (last seen ${manilaClock(i.lastSeen)}). The fan keeps running on its own.`,
  );
}

export function backOnlineMessage(i: { name: string }): string {
  return fit(`ETanim OK: ${smsName(i.name)} is back online.`);
}

export function testMessage(): string {
  return 'ETanim test: SMS alerts are working.';
}
