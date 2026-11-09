import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface ActivityBucket {
  /** 0–1: share of the bucket the fan was on. */
  fraction: number;
}

interface BarActivityChartProps {
  buckets: readonly ActivityBucket[];
  /** Labels spread evenly under the bars ("12 AM", "12 PM", "Now"). */
  xLabels: readonly string[];
  height?: number;
  accessibilityLabel: string;
}

const MIN_BAR = 6;

/** One bar per bucket: green when the fan ran (height = share of time), faint gray when not. */
export const BarActivityChart = memo(function BarActivityChart({
  buckets,
  xLabels,
  height = 64,
  accessibilityLabel,
}: BarActivityChartProps) {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={[styles.bars, { height }]}>
        {buckets.map((b, i) => {
          const on = b.fraction > 0;
          const h = on ? Math.max(MIN_BAR * 2, b.fraction * height) : MIN_BAR;
          return (
            <View
              key={i}
              style={[
                styles.bar,
                { height: h, backgroundColor: on ? colors.accent : colors.surfaceMuted },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.labels} importantForAccessibility="no-hide-descendants">
        {xLabels.map((l, i) => (
          <Text key={`${l}-${i}`} variant="micro" color="tertiary">
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { flex: 1, borderRadius: 2 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
});
