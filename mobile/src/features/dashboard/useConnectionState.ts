import type { ConnectionState } from '@/components/greenhouse';
import { useDemoStore } from '@/store/demoStore';
import { useLiveStore } from '@/store/liveStore';
import { useNetworkStore } from '@/store/networkStore';

/**
 * One rule for what every screen shows:
 * - phone-offline: no internet at all
 * - connected: the server answers (live socket, or the 10 s poll succeeded)
 * - device-offline: the server is fine but the ESP32 is not
 * - backend-unreachable: the server doesn't answer (asleep, starting up, or down)
 * - reconnecting: the live connection dropped, retrying
 * - connecting: first connection / coming back from the background
 */
export function useConnectionState(
  deviceId: string | undefined,
  restFailed: boolean,
): ConnectionState {
  const socket = useLiveStore((s) => s.socket);
  const poll = useLiveStore((s) => s.poll);
  const online = useLiveStore((s) => (deviceId ? s.devices[deviceId]?.online : undefined));
  const phone = useNetworkStore((s) => s.connected);
  const demoOffline = useDemoStore((s) => s.deviceOffline);
  const demoUnreachable = useDemoStore((s) => s.serverUnreachable);

  // Demo sheet overrides (always off in normal use).
  if (demoUnreachable) return 'backend-unreachable';
  if (demoOffline) return 'device-offline';

  if (phone === false) return 'phone-offline';
  if (socket === 'connected' || (poll === 'ok' && !restFailed)) {
    return online === false ? 'device-offline' : 'connected';
  }
  if (socket === 'error' || poll === 'error' || restFailed) return 'backend-unreachable';
  if (socket === 'reconnecting') return 'reconnecting';
  return 'connecting'; // idle, connecting, paused (just resumed)
}
