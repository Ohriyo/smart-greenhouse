import { ConnectionBanner } from '@/components/greenhouse';
import { retryRealtimeNow } from '@/services/realtime/socket';
import { useLiveStore } from '@/store/liveStore';

import { useConnectionState } from './useConnectionState';

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
  const state = useConnectionState(deviceId, restFailed);
  const lastSeen = useLiveStore((s) => (deviceId ? s.devices[deviceId]?.lastSeen : null) ?? null);
  const dataTs = useLiveStore((s) => (deviceId ? s.readings[deviceId]?.ts : null) ?? null);
  return (
    <ConnectionBanner
      state={state}
      lastSeen={lastSeen}
      dataTs={dataTs}
      onRetry={retryRealtimeNow}
    />
  );
}
