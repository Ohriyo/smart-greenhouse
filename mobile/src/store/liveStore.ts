import { create } from 'zustand';

import type { Device, FanState, Reading } from '@/types/api';

/**
 * Socket.IO connection state:
 * - idle: no server URL / not started
 * - connecting: first attempt since start or URL change
 * - connected: live
 * - reconnecting: was connected, connection dropped, retrying
 * - error: connection attempts are failing (server unreachable)
 */
export type SocketStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface LiveState {
  devices: Record<string, Device>;
  /** Device ids in API order (sorted by id). */
  deviceIds: string[];
  /** Latest reading per device. */
  readings: Record<string, Reading>;
  /** When the app last received data for a device (ms, phone clock). */
  lastUpdated: Record<string, number>;
  socket: SocketStatus;
  socketError: string | null;

  setDevices: (devices: Device[]) => void;
  upsertDevice: (device: Device) => void;
  setReading: (reading: Reading) => void;
  applyFanState: (state: FanState) => void;
  setSocket: (status: SocketStatus, error?: string | null) => void;
  /** Clears all live data (e.g. when the server URL changes). */
  reset: () => void;
}

const empty = {
  devices: {},
  deviceIds: [],
  readings: {},
  lastUpdated: {},
  socket: 'idle' as SocketStatus,
  socketError: null,
};

export const useLiveStore = create<LiveState>((set) => ({
  ...empty,

  setDevices: (list) =>
    set((s) => {
      const devices = { ...s.devices };
      for (const d of list) devices[d.id] = d;
      return { devices, deviceIds: list.map((d) => d.id) };
    }),

  upsertDevice: (device) =>
    set((s) => ({
      devices: { ...s.devices, [device.id]: device },
      deviceIds: s.deviceIds.includes(device.id) ? s.deviceIds : [...s.deviceIds, device.id].sort(),
    })),

  // Keep the newest reading: REST /latest and socket events can arrive in any order.
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
      const current = s.readings[fan.deviceId];
      if (!current || Date.parse(current.ts) > Date.parse(fan.ts)) return s;
      return {
        readings: {
          ...s.readings,
          [fan.deviceId]: { ...current, fanOn: fan.fanOn, fanMode: fan.fanMode },
        },
      };
    }),

  setSocket: (status, error = null) => set({ socket: status, socketError: error }),

  reset: () => set(empty),
}));
