import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  accessibilityLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Describes the whole group for TalkBack, e.g. "Time range". */
  accessibilityLabel: string;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const { colors, radii } = theme;

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: colors.surfaceMuted, borderRadius: radii.md }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ checked: selected, disabled }}
            style={[
              styles.segment,
              { borderRadius: radii.sm },
              selected
                ? [styles.selected, { backgroundColor: colors.surface, shadowColor: colors.text }]
                : null,
              disabled ? styles.disabled : null,
            ]}
          >
            <Text
              variant={selected ? 'bodyStrong' : 'body'}
              color={selected ? 'primary' : 'secondary'}
              numberOfLines={1}
              style={styles.label}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 3, gap: 3 },
  // 44 + 2×3 track padding = 50dp tall control, above the 48dp minimum.
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  selected: {
    elevation: 1,
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  label: { fontSize: 15 },
  disabled: { opacity: 0.5 },
});
