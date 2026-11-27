import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { ConnectionBanner } from '@/components/greenhouse';
import { retryRealtimeNow } from '@/services/realtime/socket';
import { useLiveStore } from '@/store/liveStore';

import { useConnectionState } from './useConnectionState';

/** Queries a "Retry now" refreshes (besides reopening the socket). */
const RETRY_ROOTS = new Set(['devices', 'latest', 'alerts', 'thresholds', 'recent', 'history']);

/**
 * Connection banner for a screen: why data may not be live, and how old the
 * shown data is. `restFailed`: the screen's own REST request failed.
 */
export function LiveBanner({
  deviceId,
  restFailed = false,
}: {
  deviceId: string | undefined;
  restFailed?: boolean;
}) {
  const queryClient = useQueryClient();
  const state = useConnectionState(deviceId, restFailed);
  const lastSeen = useLiveStore((s) => (deviceId ? s.devices[deviceId]?.lastSeen : null) ?? null);
  const dataTs = useLiveStore((s) => (deviceId ? s.readings[deviceId]?.ts : null) ?? null);
  const retry = useCallback(() => {
    retryRealtimeNow();
    void queryClient.refetchQueries({
      predicate: (q) => typeof q.queryKey[0] === 'string' && RETRY_ROOTS.has(q.queryKey[0]),
      type: 'active',
    });
  }, [queryClient]);
  return <ConnectionBanner state={state} lastSeen={lastSeen} dataTs={dataTs} onRetry={retry} />;
}
