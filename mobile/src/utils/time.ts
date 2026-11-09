import { useEffect, useState } from 'react';

/** "just now", "12 s ago", "5 min ago", "3 h ago", "2 d ago". */
export function formatRelative(iso: string | null, now: number): string {
  if (!iso) return 'never';
  const diffSec = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec} s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/** Spoken form for screen readers ("12 seconds ago"). */
export function formatRelativeSpoken(iso: string | null, now: number): string {
  return formatRelative(iso, now)
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
