import { StyleSheet, View } from 'react-native';

import { toneColors, useTheme, type StatusTone } from '@/theme';

import { Text } from './Text';

interface StatusPillProps {
  tone: StatusTone;
  label: string;
  /** Spoken text if different from the label (e.g. "Device online"). */
  accessibilityLabel?: string;
}

/** Small colored label. Never relies on color alone: it always has text. */
export function StatusPill({ tone, label, accessibilityLabel }: StatusPillProps) {
  const theme = useTheme();
  const { fg, bg } = toneColors(theme, tone);
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.pill, { backgroundColor: bg, borderRadius: theme.radii.pill }]}
    >
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text variant="label" tint={fg} numberOfLines={1}>
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
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
