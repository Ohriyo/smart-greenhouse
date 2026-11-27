import { useLiveStore } from '@/store/liveStore';

import { useDevicesQuery, useLatestQuery } from './queries';

/**
 * Keeps the newest reading polled every 10 s on every screen, not only Home (a
 * web visitor may open /alerts directly). Screens that use the same queries share
 * these requests. Renders nothing; must be inside the query client provider.
 */
export function LivePoller() {
  useDevicesQuery();
  const deviceId = useLiveStore((s) => s.deviceIds[0]);
  useLatestQuery(deviceId);
  return null;
}
