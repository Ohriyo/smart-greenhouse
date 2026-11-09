import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { useLayoutWidth } from '@/utils/useLayoutWidth';
import { useReducedMotion } from '@/utils/useReducedMotion';

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
  /** Value whose segment shows a spinner-free "pending" look (confirm-before-commit). */
  pendingValue?: T | null;
}

const PAD = 4;
const HEIGHT = 48;

/** Pill track with a pill-shaped white active segment that slides between options. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
  pendingValue = null,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const { colors } = theme;
  const reducedMotion = useReducedMotion();
  const [width, onLayout] = useLayoutWidth();
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segment = width > 0 ? (width - PAD * 2) / options.length : 0;
  const x = useSharedValue(index * segment);

  useEffect(() => {
    x.set(reducedMotion ? index * segment : withTiming(index * segment, { duration: 220 }));
  }, [index, segment, reducedMotion, x]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={onLayout}
      style={[
        styles.track,
        { backgroundColor: colors.surfaceMuted },
        disabled ? styles.disabled : null,
      ]}
    >
      {segment > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              width: segment,
              backgroundColor: colors.surface,
              boxShadow: `0px 1px 3px ${colors.shadow}`,
            },
            thumbStyle,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        const pending = option.value === pendingValue && !selected;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ checked: selected, disabled, busy: pending }}
            style={styles.segment}
          >
            <Text
              variant={selected ? 'bodyStrong' : 'body'}
              tint={selected ? colors.accent : pending ? colors.accent : colors.textSecondary}
              numberOfLines={1}
              style={[styles.label, pending ? styles.pending : null]}
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
  track: { flexDirection: 'row', padding: PAD, height: HEIGHT, borderRadius: HEIGHT / 2 },
  thumb: {
    position: 'absolute',
    top: PAD,
    left: PAD,
    bottom: PAD,
    borderRadius: (HEIGHT - PAD * 2) / 2,
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  label: { fontSize: 14 },
  pending: { opacity: 0.6 },
  disabled: { opacity: 0.5 },
});
