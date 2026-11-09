import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from './tokens';

export * from './tokens';

/** Current theme, following the system light/dark setting. */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}

/** Semantic status used by pills, cards and banners. */
export type StatusTone = 'ok' | 'warning' | 'danger' | 'offline' | 'neutral' | 'accent';

export function toneColors(theme: Theme, tone: StatusTone): { fg: string; bg: string } {
  const c = theme.colors;
  switch (tone) {
    case 'ok':
      return { fg: c.ok, bg: c.okSoft };
    case 'warning':
      return { fg: c.warning, bg: c.warningSoft };
    case 'danger':
      return { fg: c.danger, bg: c.dangerSoft };
    case 'offline':
      return { fg: c.offline, bg: c.offlineSoft };
    case 'accent':
      return { fg: c.accent, bg: c.accentSoft };
    case 'neutral':
      return { fg: c.textSecondary, bg: c.surfaceMuted };
  }
}
