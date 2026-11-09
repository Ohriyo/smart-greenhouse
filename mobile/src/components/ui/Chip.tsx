import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Badge } from './Badge';
import { Text } from './Text';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Colored dot before the label (metric color). */
  dotColor?: string;
  /** Count badge after the label ("All ②"). */
  count?: number;
  accessibilityLabel?: string;
}

/** Selectable pill (filters, metric pickers). Selected = soft tint of its color. */
export function Chip({ label, selected, onPress, dotColor, count, accessibilityLabel }: ChipProps) {
  const theme = useTheme();
  const { colors } = theme;
  const tint = dotColor ?? colors.accent;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8 }}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? (count ? `${label}, ${count}` : label)}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? `${tint}1F` : colors.surface,
          borderColor: selected ? `${tint}55` : colors.border,
        },
        pressed ? styles.pressed : null,
      ]}
    >
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      <Text
        variant="label"
        tint={selected ? (dotColor ? colors.text : colors.accent) : colors.textSecondary}
        numberOfLines={1}
      >
        {label}
      </Text>
      {count ? <Badge count={count} tone="accent" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pressed: { opacity: 0.8 },
});
