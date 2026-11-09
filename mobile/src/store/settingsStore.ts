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

export const ThemePreferenceSchema = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

// themePreference is optional so data saved before it existed still loads.
const PersistedSchema = z.object({
  apiUrl: ApiUrlSchema.nullable(),
  themePreference: ThemePreferenceSchema.optional(),
});

interface SettingsState {
  /** Backend base URL; null when neither saved nor set in mobile/.env. */
  apiUrl: string | null;
  /** True once the saved value has been read from AsyncStorage. */
  hydrated: boolean;
  /** Appearance: follow the phone (system) or force light/dark. */
  themePreference: ThemePreference;
  setApiUrl: (url: string) => void;
  resetApiUrl: () => void;
  setThemePreference: (preference: ThemePreference) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiUrl: DEFAULT_API_URL,
      hydrated: false,
      themePreference: 'system',
      setApiUrl: (url) => set({ apiUrl: ApiUrlSchema.parse(url) }),
      resetApiUrl: () => set({ apiUrl: DEFAULT_API_URL }),
      setThemePreference: (themePreference) => set({ themePreference }),
    }),
    {
      name: 'settings',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ apiUrl: s.apiUrl, themePreference: s.themePreference }),
      // Stored data is external input: validate it, fall back to defaults if bad.
      merge: (persisted, current) => {
        const parsed = PersistedSchema.safeParse(persisted);
        return parsed.success
          ? {
              ...current,
              apiUrl: parsed.data.apiUrl,
              themePreference: parsed.data.themePreference ?? current.themePreference,
            }
          : current;
      },
      onRehydrateStorage: () => () => {
        useSettingsStore.setState({ hydrated: true });
      },
    },
  ),
);
