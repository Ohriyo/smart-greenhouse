import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface HeatmapRow {
  /** Row label ("M", "T", …). */
  label: string;
  /** One value per column; null = no data. */
  values: readonly (number | null)[];
}

interface HeatmapGridProps {
  rows: readonly HeatmapRow[];
  /** Cell color at full intensity (the metric color). */
  color: string;
  /** Column labels placed at their column index, e.g. {0:"12a", 6:"6a", 12:"12p", 18:"6p"}. */
  columnLabels: Readonly<Record<number, string>>;
  accessibilityLabel: string;
}

/** Rows × columns of small cells; intensity = value between the grid's min and max. */
export const HeatmapGrid = memo(function HeatmapGrid({
  rows,
  color,
  columnLabels,
  accessibilityLabel,
}: HeatmapGridProps) {
  const theme = useTheme();
  const columns = rows[0]?.values.length ?? 0;

  const [lo, hi] = useMemo(() => {
    let a = Infinity;
    let b = -Infinity;
    for (const r of rows)
      for (const v of r.values)
        if (v !== null) {
          a = Math.min(a, v);
          b = Math.max(b, v);
        }
    return [a, b];
  }, [rows]);

  const opacity = (v: number | null) => {
    if (v === null || !Number.isFinite(lo)) return 0;
    return 0.15 + 0.85 * ((v - lo) / (hi - lo || 1));
  };

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={styles.wrap}
    >
      {rows.map((row, ri) => (
        <View key={`${row.label}-${ri}`} style={styles.row}>
          <Text variant="micro" color="tertiary" style={styles.rowLabel}>
            {row.label}
          </Text>
          {row.values.map((v, ci) => (
            <View
              key={ci}
              style={[
                styles.cell,
                {
                  backgroundColor: v === null ? theme.colors.surfaceMuted : color,
                  opacity: v === null ? 1 : opacity(v),
                },
              ]}
            />
          ))}
        </View>
      ))}
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        <View style={styles.rowLabel} />
        {Array.from({ length: columns }, (_, ci) => (
          <View key={ci} style={styles.labelCell}>
            {columnLabels[ci] ? (
              <Text variant="micro" color="tertiary" numberOfLines={1} style={styles.colLabel}>
                {columnLabels[ci]}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rowLabel: { width: 14, fontSize: 9 },
  cell: { flex: 1, aspectRatio: 1.4, borderRadius: 2 },
  labelCell: { flex: 1, overflow: 'visible' },
  colLabel: { fontSize: 9, width: 28 },
});
