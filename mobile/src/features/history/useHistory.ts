import { useQuery } from '@tanstack/react-query';

import { useServer } from '@/features/dashboard/queries';
import { api } from '@/services/api';
import type { AlertMetric, HistoryMetric, HistoryRange } from '@/types/api';

const MIN = 60_000;

/** How long data stays fresh, and how often it refreshes while the screen is open. */
const FRESHNESS: Record<HistoryRange, number> = {
  '24h': 1 * MIN, // one bucket ≈ 7 min
  '7d': 5 * MIN, // one bucket ≈ 50 min
  '30d': 15 * MIN, // one bucket ≈ 3.6 h
};

/**
 * Downsampled history (≈200 buckets with avg/min/max) for one metric and range.
 * When only the range changes, the previous chart stays visible while loading;
 * when the metric changes it doesn't (different units would be misleading).
 */
export function useHistory(
  deviceId: string | undefined,
  metric: HistoryMetric,
  range: HistoryRange,
) {
  const { apiUrl, ready } = useServer();
  return useQuery({
    queryKey: ['history', apiUrl, deviceId, metric, range] as const,
    enabled: ready && !!deviceId,
    queryFn: ({ signal }) => api.history(deviceId ?? '', metric, range, signal),
    staleTime: FRESHNESS[range],
    refetchInterval: FRESHNESS[range],
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[3] === metric ? previous : undefined,
  });
}

/** How long the fan ran per bucket (Manila-aligned) for a range. */
export function useFanActivity(deviceId: string | undefined, range: HistoryRange) {
  const { apiUrl, ready } = useServer();
  return useQuery({
    queryKey: ['fanActivity', apiUrl, deviceId, range] as const,
    enabled: ready && !!deviceId,
    queryFn: ({ signal }) => api.fanActivity(deviceId ?? '', range, signal),
    staleTime: FRESHNESS[range],
    refetchInterval: FRESHNESS[range],
    placeholderData: (previous) => previous,
  });
}

/** Hourly averages of the last 7 Manila days (heatmap). Changes slowly. */
export function useHeatmap(deviceId: string | undefined, metric: AlertMetric) {
  const { apiUrl, ready } = useServer();
  return useQuery({
    queryKey: ['heatmap', apiUrl, deviceId, metric] as const,
    enabled: ready && !!deviceId,
    queryFn: ({ signal }) => api.heatmap(deviceId ?? '', metric, 7, signal),
    staleTime: 10 * MIN,
  });
}
