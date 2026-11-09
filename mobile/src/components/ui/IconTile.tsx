import { View } from 'react-native';

import { toneColors, useTheme, type StatusTone } from '@/theme';

import { Icon, type IconName } from './Icon';

interface IconTileProps {
  icon: IconName;
  /** Status tone for the colors… */
  tone?: StatusTone;
  /** …or explicit colors (e.g. a metric color). `color` = icon, `background` = tile. */
  color?: string;
  background?: string;
  /** Solid tile with a white icon (status card "✓", fan row). */
  solid?: boolean;
  size?: number;
  /** "circle" for big hero discs; default rounded square. */
  shape?: 'rounded' | 'circle';
}

/** Rounded square (or circle) with a centered icon. Decorative: hidden from TalkBack. */
export function IconTile({
  icon,
  tone = 'accent',
  color,
  background,
  solid = false,
  size = 40,
  shape = 'rounded',
}: IconTileProps) {
  const theme = useTheme();
  const t = toneColors(theme, tone);
  const fg = color ?? t.fg;
  const bg = background ?? t.bg;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'circle' ? size / 2 : Math.round(size * 0.3),
        backgroundColor: solid ? fg : bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={solid ? theme.colors.onAccent : fg} />
    </View>
  );
}
