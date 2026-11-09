// button-check-ignore: selectable theme preview *cards* (rounded rectangles), not buttons
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { darkColors, lightColors, useTheme } from '@/theme';

interface ThemePreviewProps {
  scheme: 'light' | 'dark';
  selected: boolean;
  onPress: () => void;
}

/** A tiny mock of the app in one theme; tapping it selects that theme. */
export const ThemePreview = memo(function ThemePreview({
  scheme,
  selected,
  onPress,
}: ThemePreviewProps) {
  const { colors } = useTheme();
  const mock = scheme === 'dark' ? darkColors : lightColors;
  const name = scheme === 'dark' ? 'Dark' : 'Light';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${name} theme`}
      accessibilityState={{ checked: selected }}
      style={[
        styles.card,
        { borderColor: selected ? colors.accent : colors.border, backgroundColor: colors.surface },
        selected ? styles.selected : null,
      ]}
    >
      <View style={[styles.screen, { backgroundColor: mock.background }]}>
        <View style={[styles.bar, { backgroundColor: mock.surfaceMuted, width: '55%' }]} />
        <View style={[styles.tile, { backgroundColor: mock.surface, borderColor: mock.border }]}>
          <View style={[styles.dot, { backgroundColor: mock.accent }]} />
          <View style={[styles.line, { backgroundColor: mock.border }]} />
        </View>
        <View style={[styles.tile, { backgroundColor: mock.surface, borderColor: mock.border }]}>
          <View style={[styles.dot, { backgroundColor: mock.chart.airTemp }]} />
          <View style={[styles.line, { backgroundColor: mock.border, width: '45%' }]} />
        </View>
      </View>
      <Text variant="label" tint={selected ? colors.accent : colors.textSecondary}>
        {name}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: 16, borderWidth: 1.5, padding: 8, gap: 8 },
  selected: { borderWidth: 2 },
  screen: { borderRadius: 10, padding: 8, gap: 6, height: 84, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    height: 20,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { height: 4, borderRadius: 2, width: '65%' },
});
