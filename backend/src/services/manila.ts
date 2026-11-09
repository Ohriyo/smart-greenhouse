/**
 * Asia/Manila calendar math (UTC+8, no daylight saving since 1978), so charts
 * align to the user's local hours and days. Pure functions: unit-tested.
 */
export const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Start (epoch ms) of the Manila-aligned period of `sizeMs` that contains `t`. */
export function manilaFloor(t: number, sizeMs: number): number {
  return Math.floor((t + MANILA_OFFSET_MS) / sizeMs) * sizeMs - MANILA_OFFSET_MS;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** "2026-11-09" and "Mon" for the Manila day starting at `dayStart`. */
export function manilaDayLabel(dayStart: number): { date: string; weekday: string } {
  const d = new Date(dayStart + MANILA_OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    weekday: WEEKDAYS[d.getUTCDay()] ?? '',
  };
}
