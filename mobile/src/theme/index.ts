import { useColorScheme } from 'react-native';

import { useDemoStore } from '@/store/demoStore';
import { useSettingsStore } from '@/store/settingsStore';

import { darkTheme, lightTheme, type Theme } from './tokens';

export * from './tokens';

/**
 * Current theme: Light / Dark / System from Settings → Appearance.
 * Returns one of two constant objects, so it never causes extra re-renders.
 */
export function useTheme(): Theme {
  const preference = useSettingsStore((s) => s.themePreference);
  const system = useColorScheme();
  const demoDark = useDemoStore((s) => s.darkMode); // Demo sheet override; always false normally
  const scheme = demoDark
    ? 'dark'
    : preference === 'system'
      ? system === 'dark'
        ? 'dark'
        : 'light'
      : preference;
  return scheme === 'dark' ? darkTheme : lightTheme;
}

/** Semantic status used by pills, tiles, cards and banners. */
export type StatusTone =
  'ok' | 'warning' | 'danger' | 'info' | 'offline' | 'neutral' | 'accent' | 'demo';

export function toneColors(theme: Theme, tone: StatusTone): { fg: string; bg: string } {
  const c = theme.colors;
  switch (tone) {
    case 'ok':
      return { fg: c.ok, bg: c.okSoft };
    case 'warning':
      return { fg: c.warning, bg: c.warningSoft };
    case 'danger':
      return { fg: c.danger, bg: c.dangerSoft };
    case 'info':
      return { fg: c.info, bg: c.infoSoft };
    case 'offline':
      return { fg: c.offline, bg: c.offlineSoft };
    case 'accent':
      return { fg: c.accent, bg: c.accentSoft };
    case 'demo':
      return { fg: c.demo, bg: c.demoSoft };
    case 'neutral':
      return { fg: c.textSecondary, bg: c.surfaceMuted };
  }
}
