import type { ConnectionState } from '@/components/greenhouse';
import { useLiveStore } from '@/store/liveStore';
import { sameLan, useNetworkStore } from '@/store/networkStore';
import { useDemoStore } from '@/store/demoStore';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * One rule for what every screen shows:
 * - phone-offline: no Wi-Fi and no mobile data
 * - away: no live connection and the phone is on mobile data or on another
 *   Wi-Fi (the backend only exists on the home LAN)
 * - backend-unreachable: on the home Wi-Fi, but the laptop/backend doesn't answer
 * - reconnecting: the live connection dropped, retrying
 * - connecting: first connection / coming back from the background
 * - device-offline: backend is fine but the ESP32 is not
 * - connected: live
 */
export function useConnectionState(
  deviceId: string | undefined,
  restFailed: boolean,
): ConnectionState {
  const socket = useLiveStore((s) => s.socket);
  const online = useLiveStore((s) => (deviceId ? s.devices[deviceId]?.online : undefined));
  const phone = useNetworkStore((s) => s.connected);
  const type = useNetworkStore((s) => s.type);
  const ip = useNetworkStore((s) => s.ipAddress);
  const apiUrl = useSettingsStore((s) => s.apiUrl);
  const lan = sameLan(apiUrl, ip);
  const demoOffline = useDemoStore((s) => s.deviceOffline);
  const demoUnreachable = useDemoStore((s) => s.serverUnreachable);

  // Demo sheet overrides (always off in normal use).
  if (demoUnreachable) return 'backend-unreachable';
  if (demoOffline) return 'device-offline';

  if (phone === false) return 'phone-offline';
  if (socket === 'connected') return online === false ? 'device-offline' : 'connected';

  // Not connected: say *why* as precisely as we can.
  if (type === 'cellular' || lan === false) return 'away';
  if (socket === 'error' || restFailed) return 'backend-unreachable';
  if (socket === 'reconnecting') return 'reconnecting';
  return 'connecting'; // idle, connecting, paused (just resumed)
}
