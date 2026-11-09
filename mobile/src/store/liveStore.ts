import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DeviceSchema, ReadingSchema, type Device, type FanState, type Reading } from '@/types/api';

/**
 * Socket.IO connection state:
 * - idle: no server URL / not started
 * - connecting: first attempt since start, URL change or resume
 * - connected: live
 * - reconnecting: was connected, connection dropped, retrying with backoff
 * - error: connection attempts are failing (server unreachable)
 * - paused: closed on purpose (app in the background or phone offline)
 */
export type SocketStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'paused';

/**
 * How much a device's values can be trusted right now:
 * - live: received in this session over a working connection
 * - offline: the backend says the device is offline
 * - stale: last known values (restored after a restart, or no connection)
 */
export type Liveness = 'live' | 'offline' | 'stale';

/** While (re)connecting, data received this recently still counts as live (no flicker). */
const RECONNECT_GRACE_MS = 30_000;

interface LiveState {
  /** Server the data below came from (data of another server is never shown). */
  serverUrl: string | null;
  devices: Record<string, Device>;
  /** Device ids in API order (sorted by id). */
  deviceIds: string[];
  /** Latest reading per device. */
  readings: Record<string, Reading>;
  /** When the app received data for a device in *this* session (ms, phone clock). Not persisted. */
  lastUpdated: Record<string, number>;
  /** When the fan state (on/off or mode) last changed per device (ms, device time). */
  fanChangedAt: Record<string, number>;
  socket: SocketStatus;
  socketError: string | null;
  /** True once the saved data has been read from storage. */
  hydrated: boolean;

  /** Switches to `url`; clears the data if it belonged to another server. */
  switchServer: (url: string | null) => void;
  setDevices: (devices: Device[]) => void;
  upsertDevice: (device: Device) => void;
  setReading: (reading: Reading) => void;
  applyFanState: (state: FanState) => void;
  setSocket: (status: SocketStatus, error?: string | null) => void;
}

const emptyData = {
  devices: {},
  deviceIds: [],
  readings: {},
  lastUpdated: {},
  fanChangedAt: {},
};

/** What is saved, validated when read back (storage is external input). */
const PersistedSchema = z.object({
  serverUrl: z.string().nullable(),
  devices: z.record(z.string(), DeviceSchema),
  deviceIds: z.array(z.string()),
  readings: z.record(z.string(), ReadingSchema),
  fanChangedAt: z.record(z.string(), z.number()),
});

export const useLiveStore = create<LiveState>()(
  persist(
    (set) => ({
      serverUrl: null,
      ...emptyData,
      socket: 'idle',
      socketError: null,
      hydrated: false,

      switchServer: (url) =>
        set((s) => (s.serverUrl === url ? s : { ...emptyData, serverUrl: url })),

      setDevices: (list) =>
        set((s) => {
          const devices = { ...s.devices };
          for (const d of list) devices[d.id] = d;
          return { devices, deviceIds: list.map((d) => d.id) };
        }),

      upsertDevice: (device) =>
        set((s) => ({
          devices: { ...s.devices, [device.id]: device },
          deviceIds: s.deviceIds.includes(device.id)
            ? s.deviceIds
            : [...s.deviceIds, device.id].sort(),
        })),

      // Keep the newest reading: REST /latest and socket events can arrive in any order.
      // The same reading again (e.g. /latest after a reconnect) refreshes `lastUpdated`.
      setReading: (reading) =>
        set((s) => {
          const current = s.readings[reading.deviceId];
          if (current && Date.parse(current.ts) > Date.parse(reading.ts)) return s;
          return {
            readings: { ...s.readings, [reading.deviceId]: reading },
            lastUpdated: { ...s.lastUpdated, [reading.deviceId]: Date.now() },
          };
        }),

      applyFanState: (fan) =>
        set((s) => {
          const changedAt = Date.parse(fan.ts);
          const prevChange = s.fanChangedAt[fan.deviceId];
          const fanChangedAt =
            prevChange === undefined || changedAt > prevChange
              ? { ...s.fanChangedAt, [fan.deviceId]: changedAt }
              : s.fanChangedAt;
          const current = s.readings[fan.deviceId];
          if (!current || Date.parse(current.ts) > changedAt) return { fanChangedAt };
          return {
            fanChangedAt,
            readings: {
              ...s.readings,
              [fan.deviceId]: { ...current, fanOn: fan.fanOn, fanMode: fan.fanMode },
            },
          };
        }),

      setSocket: (status, error = null) => set({ socket: status, socketError: error }),
    }),
    {
      name: 'live',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        serverUrl: s.serverUrl,
        devices: s.devices,
        deviceIds: s.deviceIds,
        readings: s.readings,
        fanChangedAt: s.fanChangedAt,
      }),
      merge: (persisted, current) => {
        const parsed = PersistedSchema.safeParse(persisted);
        return parsed.success ? { ...current, ...parsed.data } : current;
      },
      onRehydrateStorage: () => () => {
        useLiveStore.setState({ hydrated: true });
      },
    },
  ),
);

/**
 * Liveness of one device's data (use inside a selector: returns a primitive, so
 * cards re-render only when it changes).
 */
export function selectLiveness(s: LiveState, deviceId: string): Liveness {
  const updated = s.lastUpdated[deviceId];
  const offline = s.devices[deviceId]?.online === false;
  if (s.socket === 'connected') {
    if (offline) return 'offline';
    return updated === undefined ? 'stale' : 'live';
  }
  const transient = s.socket === 'connecting' || s.socket === 'reconnecting';
  if (transient && updated !== undefined && Date.now() - updated < RECONNECT_GRACE_MS) {
    return offline ? 'offline' : 'live';
  }
  return 'stale';
}
