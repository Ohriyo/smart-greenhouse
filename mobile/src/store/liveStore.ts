import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DeviceSchema, ReadingSchema, type Device, type Reading } from '@/types/api';

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
 * The 10 s poll of the newest reading (src/features/dashboard/queries.ts), which
 * keeps the data current even when the socket can't connect:
 * - idle: no poll finished yet (or the app was in the background)
 * - ok: the last poll succeeded
 * - error: the last poll failed (server unreachable or too slow)
 */
export type PollStatus = 'idle' | 'ok' | 'error';

/**
 * How much a device's values can be trusted right now:
 * - live: received in this session over a working connection (socket or poll)
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
  socket: SocketStatus;
  socketError: string | null;
  poll: PollStatus;
  /** True once the saved data has been read from storage. */
  hydrated: boolean;

  /** Switches to `url`; clears the data if it belonged to another server. */
  switchServer: (url: string | null) => void;
  setDevices: (devices: Device[]) => void;
  upsertDevice: (device: Device) => void;
  setReading: (reading: Reading) => void;
  setSocket: (status: SocketStatus, error?: string | null) => void;
  setPoll: (status: PollStatus) => void;
}

const emptyData = {
  devices: {},
  deviceIds: [],
  readings: {},
  lastUpdated: {},
};

/** What is saved, validated when read back (storage is external input). */
const PersistedSchema = z.object({
  serverUrl: z.string().nullable(),
  devices: z.record(z.string(), DeviceSchema),
  deviceIds: z.array(z.string()),
  readings: z.record(z.string(), ReadingSchema),
});

export const useLiveStore = create<LiveState>()(
  persist(
    (set) => ({
      serverUrl: null,
      ...emptyData,
      socket: 'idle',
      socketError: null,
      poll: 'idle',
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

      setSocket: (status, error = null) => set({ socket: status, socketError: error }),

      setPoll: (poll) => set((s) => (s.poll === poll ? s : { poll })),
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
  // A working link: socket events, or the 10 s poll of the newest reading.
  if (s.socket === 'connected' || s.poll === 'ok') {
    if (offline) return 'offline';
    return updated === undefined ? 'stale' : 'live';
  }
  const transient = s.socket === 'connecting' || s.socket === 'reconnecting';
  if (transient && updated !== undefined && Date.now() - updated < RECONNECT_GRACE_MS) {
    return offline ? 'offline' : 'live';
  }
  return 'stale';
}
