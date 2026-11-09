import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const PersistedSchema = z.object({
  token: z.string().nullable(),
  registeredWith: z.string().nullable(),
  promptDismissed: z.boolean(),
});

/**
 * - granted: notifications allowed
 * - ask: not allowed yet, Android can still show the permission dialog
 * - blocked: denied and Android won't ask again (only system settings can fix it)
 * - unknown: not checked yet
 */
export type PermissionState = 'unknown' | 'granted' | 'ask' | 'blocked';

/**
 * - unsupported: Expo Go, emulator without push, or EAS project id missing
 * - idle: nothing to do (no permission or no server)
 */
export type RegistrationState = 'idle' | 'registering' | 'registered' | 'unsupported' | 'error';

interface NotificationState {
  // Persisted
  /** Expo push token of this phone (last one we got). */
  token: string | null;
  /** Server the token is registered with (to unregister when the address changes). */
  registeredWith: string | null;
  /** "Not now" on the Alerts screen card. */
  promptDismissed: boolean;

  // Runtime
  /** True once the persisted values have been read. */
  hydrated: boolean;
  permission: PermissionState;
  registration: RegistrationState;
  /** Why registration failed or is unsupported (shown in Settings). */
  message: string | null;

  setPermission: (p: PermissionState) => void;
  setRegistration: (r: RegistrationState, message?: string | null) => void;
  setRegistered: (token: string, server: string) => void;
  dismissPrompt: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      token: null,
      registeredWith: null,
      promptDismissed: false,
      hydrated: false,
      permission: 'unknown',
      registration: 'idle',
      message: null,

      setPermission: (permission) => set({ permission }),
      setRegistration: (registration, message = null) => set({ registration, message }),
      setRegistered: (token, server) =>
        set({ token, registeredWith: server, registration: 'registered', message: null }),
      dismissPrompt: () => set({ promptDismissed: true }),
    }),
    {
      name: 'notifications',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (s) => ({
        token: s.token,
        registeredWith: s.registeredWith,
        promptDismissed: s.promptDismissed,
      }),
      // Stored data is external input: validate it, fall back to defaults if bad.
      merge: (persisted, current) => {
        const parsed = PersistedSchema.safeParse(persisted);
        return parsed.success ? { ...current, ...parsed.data } : current;
      },
      onRehydrateStorage: () => () => {
        useNotificationStore.setState({ hydrated: true });
      },
    },
  ),
);
