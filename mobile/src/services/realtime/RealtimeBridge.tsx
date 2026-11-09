import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useLiveStore } from '@/store/liveStore';
import { useSettingsStore } from '@/store/settingsStore';

import { connectRealtime } from './socket';

/**
 * Keeps the one app-wide socket connected to the saved server URL. When the URL
 * changes, the live data is cleared and a new socket is created. Renders nothing.
 */
export function RealtimeBridge() {
  const apiUrl = useSettingsStore((s) => s.apiUrl);
  const hydrated = useSettingsStore((s) => s.hydrated);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!hydrated) return;
    useLiveStore.getState().reset();
    if (!apiUrl) return;
    return connectRealtime(apiUrl, {
      // Events sent while disconnected are not replayed (contract §3): refetch.
      onConnect: () => void queryClient.invalidateQueries(),
    });
  }, [apiUrl, hydrated, queryClient]);

  return null;
}
