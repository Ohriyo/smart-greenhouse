import { useEffect, useState } from 'react';

/** "just now", "12 s ago", "5 min ago", "3 h ago", "2 d ago". */
export function formatRelative(time: string | number | null, now: number): string {
  if (time === null || time === '') return 'never';
  const ms = typeof time === 'number' ? time : Date.parse(time);
  const diffSec = Math.max(0, Math.round((now - ms) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec} s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/** Spoken form for screen readers ("12 seconds ago"). */
export function formatRelativeSpoken(time: string | number | null, now: number): string {
  return formatRelative(time, now)
    .replace(' s ago', ' seconds ago')
    .replace(' min ago', ' minutes ago')
    .replace(' h ago', ' hours ago')
    .replace(' d ago', ' days ago');
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatClock(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/**
 * Current time, refreshed every `intervalMs`. Call it once per screen and pass
 * `now` down, so a screen has one timer instead of one per card.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "2h 18m", "45m", "0m" (seconds → hours and minutes). */
export function formatDuration(totalSec: number): string {
  const min = Math.round(totalSec / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Spoken form: "2 hours 18 minutes". */
export function formatDurationSpoken(totalSec: number): string {
  const min = Math.round(totalSec / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hours = h > 0 ? `${h} hour${h === 1 ? '' : 's'}` : '';
  const mins = m > 0 || h === 0 ? `${m} minute${m === 1 ? '' : 's'}` : '';
  return [hours, mins].filter(Boolean).join(' ');
}

/** Device uptime: "12d 7h", "3h 20m", "5m", "40s". */
export function formatUptime(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}
