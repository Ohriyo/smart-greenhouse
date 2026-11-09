import type { ConnectionState } from '@/components/greenhouse';
import { useLiveStore } from '@/store/liveStore';

/**
 * One rule for what the dashboard shows:
 * - backend-unreachable: socket can't connect, or REST failed while not connected
 * - reconnecting: socket dropped after being connected, retrying
 * - connecting: first connection still in progress
 * - device-offline: backend is fine but the device is offline
 * - connected: live
 */
export function useConnectionState(
  deviceId: string | undefined,
  restFailed: boolean,
): ConnectionState {
  const socket = useLiveStore((s) => s.socket);
  const online = useLiveStore((s) => (deviceId ? s.devices[deviceId]?.online : undefined));

  if (socket === 'error' || (restFailed && socket !== 'connected')) return 'backend-unreachable';
  if (socket === 'reconnecting') return 'reconnecting';
  if (socket === 'connecting' || socket === 'idle') return 'connecting';
  if (online === false) return 'device-offline';
  return 'connected';
}
