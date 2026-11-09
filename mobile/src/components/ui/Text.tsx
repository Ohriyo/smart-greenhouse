import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme, type ColorTokens, type TypographyVariant } from '@/theme';

type TextColor = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'onAccent';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: TextColor;
  /** Overrides `color` (e.g. a status or metric color). */
  tint?: string;
  /** Tabular digits so changing numbers don't shift layout. */
  tabular?: boolean;
  uppercase?: boolean;
}

const COLOR_KEY: Record<TextColor, Exclude<keyof ColorTokens, 'chart'>> = {
  primary: 'text',
  secondary: 'textSecondary',
  tertiary: 'textTertiary',
  accent: 'accent',
  danger: 'danger',
  onAccent: 'onAccent',
};

/** Big variants are capped so huge system font sizes don't break card layouts. */
const MAX_SCALE: Partial<Record<TypographyVariant, number>> = {
  metric: 1.25,
  display: 1.25,
  value: 1.3,
  title: 1.4,
  sectionTitle: 1.5,
  eyebrow: 1.5,
  micro: 1.5,
};

export function Text({
  variant = 'body',
  color = 'primary',
  tint,
  tabular = false,
  uppercase = false,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={MAX_SCALE[variant] ?? 1.8}
      style={[
        theme.typography[variant],
        { color: tint ?? theme.colors[COLOR_KEY[color]] },
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        uppercase ? { textTransform: 'uppercase' } : null,
        style,
      ]}
      {...rest}
    />
  );
}
