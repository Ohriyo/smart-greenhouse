import { StyleSheet, View } from 'react-native';

import { toneColors, useTheme, type StatusTone } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface StatusPillProps {
  tone: StatusTone;
  label: string;
  /**
   * soft    = tinted background (default)
   * outline = white pill with a hairline border ("Connected", "Device online")
   * plain   = just dot + colored text ("● Good", "● LIVE")
   */
  variant?: 'soft' | 'outline' | 'plain';
  /** Icon instead of the dot (e.g. "wifi"). */
  icon?: IconName;
  uppercase?: boolean;
  /** Spoken text if different from the label (e.g. "Device online"). */
  accessibilityLabel?: string;
}

/** Status label: dot (or icon) + text. Never color alone: it always has text. */
export function StatusPill({
  tone,
  label,
  variant = 'soft',
  icon,
  uppercase = false,
  accessibilityLabel,
}: StatusPillProps) {
  const theme = useTheme();
  const { fg, bg } = toneColors(theme, tone);
  const container =
    variant === 'soft'
      ? { backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4 }
      : variant === 'outline'
        ? {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderWidth: 1,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }
        : null;
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.pill, container]}
    >
      {icon ? (
        <Icon name={icon} size={13} color={fg} />
      ) : (
        <View style={[styles.dot, { backgroundColor: fg }]} />
      )}
      <Text
        variant={uppercase ? 'eyebrow' : 'label'}
        tint={variant === 'outline' ? theme.colors.text : fg}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: 999,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
