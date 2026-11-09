/**
 * Design tokens. One calm green accent; everything else is neutral or a
 * semantic status color. Text colors meet WCAG AA (≥ 4.5:1) on their surfaces.
 */

export interface ColorTokens {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentPressed: string;
  accentSoft: string;
  onAccent: string;
  ok: string;
  okSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  offline: string;
  offlineSoft: string;
  overlay: string;
  skeleton: string;
}

export const lightColors: ColorTokens = {
  background: '#F7F9F7',
  surface: '#FFFFFF',
  surfaceMuted: '#EFF3EF',
  border: '#E1E7E2',
  text: '#101A13',
  textSecondary: '#526256',
  textTertiary: '#6B796E',
  accent: '#267A42',
  accentPressed: '#1E6435',
  accentSoft: '#E3F2E7',
  onAccent: '#FFFFFF',
  ok: '#267A42',
  okSoft: '#E3F2E7',
  warning: '#9A6200',
  warningSoft: '#FCF1DC',
  danger: '#C23535',
  dangerSoft: '#FBE7E7',
  offline: '#5F6B7A',
  offlineSoft: '#ECEFF2',
  overlay: 'rgba(16, 26, 19, 0.92)',
  skeleton: '#E6ECE7',
};

export const darkColors: ColorTokens = {
  background: '#0D110E',
  surface: '#151B17',
  surfaceMuted: '#1D2520',
  border: '#27312B',
  text: '#ECF2EE',
  textSecondary: '#A6B4AA',
  textTertiary: '#8A988E',
  accent: '#5CC27F',
  accentPressed: '#4AAE6C',
  accentSoft: '#1A3323',
  onAccent: '#06130B',
  ok: '#5CC27F',
  okSoft: '#1A3323',
  warning: '#E8B65C',
  warningSoft: '#3A2D14',
  danger: '#F27474',
  dangerSoft: '#3D1D1D',
  offline: '#9BA5B1',
  offlineSoft: '#242A30',
  overlay: 'rgba(236, 242, 238, 0.95)',
  skeleton: '#202923',
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Minimum touch target (Android 48dp, also covers the 44pt guideline). */
export const TOUCH_TARGET = 48;

export const typography = {
  /** Big sensor values. Tabular digits keep numbers from jumping. */
  display: { fontSize: 40, lineHeight: 46, fontWeight: '700', letterSpacing: -0.8 },
  value: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -0.1 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.6 },
} as const;

export type TypographyVariant = keyof typeof typography;

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
}

export const lightTheme: Theme = {
  scheme: 'light',
  colors: lightColors,
  spacing,
  radii,
  typography,
};
export const darkTheme: Theme = { scheme: 'dark', colors: darkColors, spacing, radii, typography };
