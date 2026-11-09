/**
 * Design tokens (ETanim prototype). Calm, airy, data-forward: a near-white
 * green-tinted background, soft cards, one green accent, semantic status colors
 * and one color per metric. Text colors meet WCAG AA (≥ 4.5:1) on their surfaces.
 */

export interface ColorTokens {
  background: string;
  surface: string;
  /** Inputs, segmented-control tracks, inactive bars. */
  surfaceMuted: string;
  /** Tinted card background (e.g. "Everything looks good"). */
  surfaceTint: string;
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
  dangerPressed: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  offline: string;
  offlineSoft: string;
  /** Dev-only "Demo" tools: purple marks "not part of the app". */
  demo: string;
  demoSoft: string;
  /** Inverted chip (the "Demo" pill). */
  inverse: string;
  onInverse: string;
  overlay: string;
  backdrop: string;
  skeleton: string;
  shadow: string;
  chart: { airTemp: string; humidity: string; soilMoisture: string; lux: string; grid: string };
}

export const lightColors: ColorTokens = {
  background: '#F4F7F5',
  surface: '#FDFDFD',
  surfaceMuted: '#EEF2EF',
  surfaceTint: '#EAF4EE',
  border: '#E4EAE6',
  text: '#15231A',
  textSecondary: '#56655B',
  textTertiary: '#5F6D63',
  // Prototype green is #35855A; slightly deeper so green TEXT (links, chips) meets WCAG AA 4.5:1
  // (npm run check:contrast). Solid fills and the white button label are fine either way.
  accent: '#2B7650',
  accentPressed: '#235F40',
  accentSoft: '#E3F1E9',
  onAccent: '#FFFFFF',
  ok: '#2B7650',
  okSoft: '#E3F1E9',
  warning: '#9A6200',
  warningSoft: '#FDF1DC',
  danger: '#B83A29',
  dangerPressed: '#9C3022',
  dangerSoft: '#FCE8E4',
  info: '#2F6BB5',
  infoSoft: '#E5EEF9',
  offline: '#5F6B78',
  offlineSoft: '#ECEFF2',
  demo: '#6A4FC2',
  demoSoft: '#EFEAFB',
  inverse: '#1C2A22',
  onInverse: '#F4F7F5',
  overlay: '#FFFFFF',
  backdrop: 'rgba(16, 28, 21, 0.45)',
  skeleton: '#E6ECE8',
  shadow: 'rgba(22, 48, 33, 0.07)',
  chart: {
    airTemp: '#E2614F',
    humidity: '#4A84D4',
    soilMoisture: '#3F8F63',
    lux: '#B8860B', // deeper amber: a 2 px line on white needs 3:1
    grid: '#DDE3DF',
  },
};

/** Dark mode (not in the prototype): near-black green-tinted surfaces, same accents, lifted for contrast. */
export const darkColors: ColorTokens = {
  background: '#0D1310',
  surface: '#141C17',
  surfaceMuted: '#1C2620',
  surfaceTint: '#16271D',
  border: '#25312A',
  text: '#E7EFE9',
  textSecondary: '#A2B1A7',
  textTertiary: '#8C9B91',
  accent: '#5BBF86',
  accentPressed: '#4AA873',
  accentSoft: '#1B3326',
  onAccent: '#05120A',
  ok: '#5BBF86',
  okSoft: '#1B3326',
  warning: '#E9B65A',
  warningSoft: '#3A2D14',
  danger: '#F07A6C',
  dangerPressed: '#E0675A',
  dangerSoft: '#3D1F1C',
  info: '#7DAAE8',
  infoSoft: '#1A2A3F',
  offline: '#9AA5B1',
  offlineSoft: '#232A30',
  demo: '#B4A1F2',
  demoSoft: '#272042',
  inverse: '#E7EFE9',
  onInverse: '#0D1310',
  overlay: '#1C2620',
  backdrop: 'rgba(0, 0, 0, 0.6)',
  skeleton: '#1F2923',
  shadow: 'rgba(0, 0, 0, 0.35)',
  chart: {
    airTemp: '#F0806F',
    humidity: '#7DAAE8',
    soilMoisture: '#5BBF86',
    lux: '#E8BE4F',
    grid: '#26312B',
  },
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  /** Icon tiles. */
  tile: 12,
  /** Cards. */
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/** Minimum touch target (Android 48dp). */
export const TOUCH_TARGET = 48;

/** Inter, loaded in app/_layout.tsx. On Android each weight is its own family. */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const typography = {
  /** Big sensor numerals (cards, gauges). */
  metric: { fontFamily: fonts.semibold, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  display: { fontFamily: fonts.semibold, fontSize: 40, lineHeight: 46, letterSpacing: -1 },
  /** Stat tiles, steppers. */
  value: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  /** Screen titles ("Settings", "History"). */
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  /** Card / section titles under an eyebrow ("Right now", "At a glance"). */
  sectionTitle: { fontFamily: fonts.medium, fontSize: 19, lineHeight: 25, letterSpacing: -0.2 },
  heading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17 },
  /** Pills, chips, small labels. */
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
  /** Small UPPERCASE letter-spaced label above a section title. */
  eyebrow: {
    fontFamily: fonts.semibold,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  /** Tiny axis / unit text. */
  micro: { fontFamily: fonts.medium, fontSize: 10.5, lineHeight: 13 },
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

/** Soft card shadow (RN `boxShadow`, new architecture). */
export function cardShadow(theme: Theme): string {
  return `0px 1px 3px ${theme.colors.shadow}, 0px 6px 16px ${theme.colors.shadow}`;
}
