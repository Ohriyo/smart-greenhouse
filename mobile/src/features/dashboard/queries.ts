import { useQuery } from '@tanstack/react-query';

import { api } from '@/services/api';
import { useLiveStore } from '@/store/liveStore';
import { useSettingsStore } from '@/store/settingsStore';

/** Query keys include the server URL so changing it never shows another server's data. */
export const queryKeys = {
  devices: (url: string | null) => ['devices', url] as const,
  latest: (url: string | null, id: string) => ['latest', url, id] as const,
  thresholds: (url: string | null, id: string) => ['thresholds', url, id] as const,
};

function useServer() {
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
