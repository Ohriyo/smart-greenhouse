import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from '@/services/api';
import { useLiveStore } from '@/store/liveStore';
import { useRecentStore } from '@/store/recentStore';
import { useSettingsStore } from '@/store/settingsStore';

/** Query keys include the server URL so changing it never shows another server's data. */
export const queryKeys = {
  devices: (url: string | null) => ['devices', url] as const,
  latest: (url: string | null, id: string) => ['latest', url, id] as const,
  thresholds: (url: string | null, id: string) => ['thresholds', url, id] as const,
  recent: (url: string | null, id: string) => ['recent', url, id] as const,
};

/** Saved server URL, and whether queries may run (settings loaded + URL set). */
export function useServer() {
  const apiUrl = useSettingsStore((s) => s.apiUrl);
  const hydrated = useSettingsStore((s) => s.hydrated);
  return { apiUrl, ready: hydrated && apiUrl !== null };
}

/** Device list; also seeds the live store (socket events keep it fresh afterwards). */
export function useDevicesQuery() {
  const { apiUrl, ready } = useServer();
  return useQuery({
    queryKey: queryKeys.devices(apiUrl),
    enabled: ready,
    queryFn: async ({ signal }) => {
      const devices = await api.devices(signal);
      useLiveStore.getState().setDevices(devices);
      return devices;
    },
  });
}

/** Device + newest reading, written into the live store. */
export function useLatestQuery(deviceId: string | undefined) {
  const { apiUrl, ready } = useServer();
  return useQuery({
    queryKey: queryKeys.latest(apiUrl, deviceId ?? ''),
    enabled: ready && !!deviceId,
    queryFn: async ({ signal }) => {
      const latest = await api.latest(deviceId ?? '', signal);
      const live = useLiveStore.getState();
      live.upsertDevice(latest.device);
      if (latest.reading) live.setReading(latest.reading);
      if (latest.lastFanChange) live.applyFanState(latest.lastFanChange);
      return latest;
    },
  });
}

export function useThresholdsQuery(deviceId: string | undefined) {
  const { apiUrl, ready } = useServer();
  return useQuery({
    queryKey: queryKeys.thresholds(apiUrl, deviceId ?? ''),
    enabled: ready && !!deviceId,
    queryFn: ({ signal }) => api.thresholds(deviceId ?? '', signal),
    staleTime: 60_000,
  });
}

/**
 * Last 30 minutes of raw readings → the live chart buffer. The query result is
 * persisted with the cache, so after an offline cold start the charts still
 * show the last known half hour. Refetched after every socket reconnect (gaps).
 */
export function useRecentQuery(deviceId: string | undefined) {
  const { apiUrl, ready } = useServer();
  const query = useQuery({
    queryKey: queryKeys.recent(apiUrl, deviceId ?? ''),
    enabled: ready && !!deviceId,
    queryFn: ({ signal }) => api.recent(deviceId ?? '', 30, signal),
    staleTime: 30_000,
  });
  const { data } = query;
  useEffect(() => {
    if (data) useRecentStore.getState().seed(data.deviceId, data.readings);
  }, [data]);
  return query;
}
