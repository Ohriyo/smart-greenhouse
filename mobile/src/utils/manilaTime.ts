/**
 * Asia/Manila time formatting (UTC+8, no daylight saving since 1978).
 * Computed directly instead of via Intl timeZone support, which varies between
 * Android JS engines; the result is the same on every phone.
 */
export const MANILA_TZ = 'Asia/Manila';
const OFFSET_MS = 8 * 3600_000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(time: string | number) {
  const d = new Date((typeof time === 'string' ? Date.parse(time) : time) + OFFSET_MS);
  return {
    weekday: WEEKDAYS[d.getUTCDay()] ?? '',
    day: d.getUTCDate(),
    month: MONTHS[d.getUTCMonth()] ?? '',
    hh: String(d.getUTCHours()).padStart(2, '0'),
    mm: String(d.getUTCMinutes()).padStart(2, '0'),
  };
}

/** "14:05" */
export function manilaTime(time: string | number): string {
  const p = parts(time);
  return `${p.hh}:${p.mm}`;
}

/** "Mon 9" */
export function manilaWeekday(time: string | number): string {
  const p = parts(time);
  return `${p.weekday} ${p.day}`;
}

/** "9 Nov" */
export function manilaDate(time: string | number): string {
  const p = parts(time);
  return `${p.day} ${p.month}`;
}

/** "Mon 9 Nov, 14:05" */
export function manilaDateTime(time: string | number): string {
  const p = parts(time);
  return `${p.weekday} ${p.day} ${p.month}, ${p.hh}:${p.mm}`;
}

/** Epoch ms of the most recent midnight in Asia/Manila (start of "today"). */
export function manilaStartOfDay(time: number): number {
  const DAY = 86_400_000;
  return Math.floor((time + OFFSET_MS) / DAY) * DAY - OFFSET_MS;
}

/** "12 AM", "9 PM" (hour only, Manila) for chart axes. */
export function manilaHour12(time: string | number): string {
  const h = Number(parts(time).hh);
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}
