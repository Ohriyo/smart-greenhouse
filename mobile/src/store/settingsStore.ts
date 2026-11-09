import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_API_URL } from '@/constants/config';

/** http(s) URL without trailing slash, e.g. "http://192.168.1.50:4000". */
export const ApiUrlSchema = z
  .string()
  .trim()
  .pipe(z.url({ protocol: /^https?$/, error: 'Enter a URL like http://192.168.1.50:4000' }))
  .transform((u) => u.replace(/\/+$/, ''));

const PersistedSchema = z.object({ apiUrl: ApiUrlSchema.nullable() });

interface SettingsState {
  /** Backend base URL; null when neither saved nor set in mobile/.env. */
  apiUrl: string | null;
  /** True once the saved value has been read from AsyncStorage. */
  hydrated: boolean;
  setApiUrl: (url: string) => void;
  resetApiUrl: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiUrl: DEFAULT_API_URL,
      hydrated: false,
      setApiUrl: (url) => set({ apiUrl: ApiUrlSchema.parse(url) }),
      resetApiUrl: () => set({ apiUrl: DEFAULT_API_URL }),
    }),
    {
      name: 'settings',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ apiUrl: s.apiUrl }),
      // Stored data is external input: validate it, fall back to defaults if bad.
      merge: (persisted, current) => {
        const parsed = PersistedSchema.safeParse(persisted);
        return parsed.success ? { ...current, apiUrl: parsed.data.apiUrl } : current;
      },
      onRehydrateStorage: () => () => {
        useSettingsStore.setState({ hydrated: true });
      },
    },
  ),
);
