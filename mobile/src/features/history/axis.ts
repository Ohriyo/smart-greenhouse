import type { HistoryRange } from '@/types/api';
import { manilaDate, manilaHour12, manilaWeekday } from '@/utils/manilaTime';

/**
 * Three honest x-axis labels for a window ending now (Manila time):
 * 24h "9 PM · 9 AM · Now", 7d "Mon 2 · Thu 5 · Now", 30d "10 Oct · 25 Oct · Now".
 * (Fixed "12 AM / 12 PM" labels would sit in the wrong place on a rolling window.)
 */
export function rangeLabels(range: HistoryRange, from: number, to: number): string[] {
  const mid = from + (to - from) / 2;
  const fmt = range === '24h' ? manilaHour12 : range === '7d' ? manilaWeekday : manilaDate;
  return [fmt(from), fmt(mid), 'Now'];
}

export const RANGE_EYEBROW: Record<HistoryRange, string> = {
  '24h': '24h overview',
  '7d': '7d overview',
  '30d': '30d overview',
};

export const RANGE_SPOKEN: Record<HistoryRange, string> = {
  '24h': 'last 24 hours',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
};
