import NetInfo, { NetInfoStateType, type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

import { useNetworkStore, type NetworkType } from '@/store/networkStore';

function toType(t: NetInfoStateType): NetworkType {
  switch (t) {
    case NetInfoStateType.wifi:
    case NetInfoStateType.ethernet:
      return 'wifi';
    case NetInfoStateType.cellular:
      return 'cellular';
    case NetInfoStateType.none:
      return 'none';
    case NetInfoStateType.unknown:
      return 'unknown';
    default:
      return 'other';
  }
}

function apply(state: NetInfoState): void {
  const ipAddress =
    state.type === NetInfoStateType.wifi || state.type === NetInfoStateType.ethernet
      ? (state.details?.ipAddress ?? null)
      : null;
  useNetworkStore.getState().set({
    connected: state.isConnected,
    type: toType(state.type),
    ipAddress,
  });
}

let started = false;

/**
 * Starts listening to NetInfo once (module level, before the first render):
 * - keeps useNetworkStore updated (connection banner, socket pause/resume)
 * - tells TanStack Query when the phone is offline, so it pauses retries and
 *   refetches automatically when the connection comes back
 */
export function startNetworkMonitoring(): void {
  if (started) return;
  started = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      apply(state);
      // null (unknown) counts as online: better to try than to wait forever.
      setOnline(state.isConnected !== false);
    }),
  );
}
