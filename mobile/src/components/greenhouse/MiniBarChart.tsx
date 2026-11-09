import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';
import type { HistoryPoint } from '@/types/api';

interface MiniBarChartProps {
  points: HistoryPoint[];
  min: number | null;
  max: number | null;
  /** Spoken summary, e.g. "Air temperature, last 24 hours, from 19 to 32 °C". */
  accessibilityLabel: string;
  height?: number;
  bars?: number;
}

/**
 * Lightweight bar sparkline built from Views (no chart library yet). Bars
 * outside the min/max limits use the warning color. The real interactive
 * chart (react-native-gifted-charts) comes with the data phase.
 */
export function MiniBarChart({
  points,
  min,
  max,
  accessibilityLabel,
  height = 120,
  bars = 48,
}: MiniBarChartProps) {
  const theme = useTheme();

  const series = useMemo(() => {
    if (points.length === 0) return [];
    const size = Math.ceil(points.length / bars);
    const groups: number[] = [];
    for (let i = 0; i < points.length; i += size) {
      const slice = points.slice(i, i + size);
      groups.push(slice.reduce((sum, p) => sum + p.avg, 0) / slice.length);
    }
    return groups;
  }, [points, bars]);

  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const span = hi - lo || 1;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.chart, { height }]}
    >
      {series.map((v, i) => {
        const out = (max !== null && v > max) || (min !== null && v < min);
        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: Math.max(3, ((v - lo) / span) * (height - 8) + 4),
                backgroundColor: out ? theme.colors.warning : theme.colors.accent,
                opacity: out ? 1 : 0.75,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { flex: 1, borderRadius: 2 },
});
