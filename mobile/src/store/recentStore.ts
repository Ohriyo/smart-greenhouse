import { create } from 'zustand';

import type { AlertMetric, Reading } from '@/types/api';

/** One compact point of the live buffer (the four charted metrics). */
export interface RecentPoint {
  /** Epoch ms (reading time). */
  t: number;
  airTemp: number | null;
  humidity: number | null;
  soilMoisture: number | null;
  lux: number | null;
}

/** How much history the live charts keep (Home "Last 30 minutes"). */
export const RECENT_WINDOW_MS = 30 * 60_000;
const MAX_POINTS = 720;

interface RecentState {
  /** Per device, oldest → newest, within the last 30 minutes. New array on every change. */
  points: Record<string, readonly RecentPoint[]>;
  /** Merge a batch (REST /recent or the cached copy of it). */
  seed: (deviceId: string, readings: readonly Reading[]) => void;
  /** Append one live reading (socket telemetry). */
  append: (reading: Reading) => void;
  clear: () => void;
}

function toPoint(r: Reading): RecentPoint {
  return {
    t: Date.parse(r.ts),
    airTemp: r.airTemp,
    humidity: r.humidity,
    soilMoisture: r.soilMoisture,
    lux: r.lux,
  };
}

/** Sorted, de-duplicated by time, trimmed to the window. */
function normalize(list: RecentPoint[], now: number): RecentPoint[] {
  const byTime = new Map<number, RecentPoint>();
  for (const p of list) byTime.set(p.t, p);
  const sorted = [...byTime.values()].sort((a, b) => a.t - b.t);
  const cutoff = now - RECENT_WINDOW_MS;
  const kept = sorted.filter((p) => p.t >= cutoff);
  return kept.length > MAX_POINTS ? kept.slice(-MAX_POINTS) : kept;
}

/**
 * Live 30-minute buffer for sparklines and the Home trend chart. Not persisted:
 * after a cold start it is re-seeded from the (persisted) /recent query.
 * Kept apart from liveStore so the charts don't re-render on unrelated changes.
 */
export const useRecentStore = create<RecentState>()((set) => ({
  points: {},
  seed: (deviceId, readings) =>
    set((s) => ({
      points: {
        ...s.points,
        [deviceId]: normalize(
          [...(s.points[deviceId] ?? []), ...readings.map(toPoint)],
          Date.now(),
        ),
      },
    })),
  append: (reading) =>
    set((s) => {
      // normalize() also handles late, out-of-order or duplicate readings.
      const next = normalize([...(s.points[reading.deviceId] ?? []), toPoint(reading)], Date.now());
      return { points: { ...s.points, [reading.deviceId]: next } };
    }),
  clear: () => set({ points: {} }),
}));

const EMPTY: readonly RecentPoint[] = [];

/** Stable selector: the device's buffer (same array until it changes). */
export function selectRecent(s: RecentState, deviceId: string | undefined): readonly RecentPoint[] {
  return (deviceId ? s.points[deviceId] : undefined) ?? EMPTY;
}

/** Values of one metric since `sinceMs`, oldest first. */
export function metricSeries(
  points: readonly RecentPoint[],
  metric: AlertMetric,
  sinceMs: number,
): (number | null)[] {
  const out: (number | null)[] = [];
  for (const p of points) if (p.t >= sinceMs) out.push(p[metric]);
  return out;
}
