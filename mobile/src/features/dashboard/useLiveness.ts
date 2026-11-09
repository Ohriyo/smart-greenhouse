import { useDemoStore } from '@/store/demoStore';
import { selectLiveness, useLiveStore, type Liveness } from '@/store/liveStore';

/**
 * How much a device's data can be trusted right now (live / offline / stale).
 * The one place screens ask this: it also applies the Demo sheet's overrides
 * ("Device offline", "Server unreachable"), which are always off in normal use.
 */
export function useLiveness(deviceId: string | undefined): Liveness {
  const real = useLiveStore((s) => (deviceId ? selectLiveness(s, deviceId) : 'stale'));
  const demo = useDemoStore((s) =>
    s.deviceOffline ? 'offline' : s.serverUnreachable ? 'stale' : null,
  );
  return demo ?? real;
}

/** Shorthand: the data is live and the device is online. */
export function useIsLive(deviceId: string | undefined): boolean {
  return useLiveness(deviceId) === 'live';
}

/** The backend's online flag for the device (undefined = unknown), with the Demo override. */
export function useDeviceOnline(deviceId: string | undefined): boolean | undefined {
  const real = useLiveStore((s) => (deviceId ? s.devices[deviceId]?.online : undefined));
  const forcedOffline = useDemoStore((s) => s.deviceOffline);
  return forcedOffline ? false : real;
}
