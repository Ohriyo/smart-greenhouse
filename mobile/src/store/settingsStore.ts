import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { API_URL } from '@/constants/config';

export const ThemePreferenceSchema = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

// A server address saved by older versions is ignored: the build sets it now.
const PersistedSchema = z.object({
  themePreference: ThemePreferenceSchema.optional(),
});

interface SettingsState {
  /** Backend base URL from the build (EXPO_PUBLIC_API_URL); null when it isn't set. */
  apiUrl: string | null;
  /** True once the saved preferences have been read from AsyncStorage. */
  hydrated: boolean;
  /** Appearance: follow the phone (system) or force light/dark. */
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiUrl: API_URL,
      hydrated: false,
      themePreference: 'system',
      setThemePreference: (themePreference) => set({ themePreference }),
    }),
    {
      name: 'settings',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ themePreference: s.themePreference }),
      // Stored data is external input: validate it, fall back to defaults if bad.
      merge: (persisted, current) => {
        const parsed = PersistedSchema.safeParse(persisted);
        return parsed.success
          ? { ...current, themePreference: parsed.data.themePreference ?? current.themePreference }
          : current;
      },
      onRehydrateStorage: () => () => {
        useSettingsStore.setState({ hydrated: true });
      },
    },
  ),
);
