// button-check-ignore: pressable sensor *card* (keeps its rounded-rectangle shape), not a button
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, IconTile, MiniSparkline, StatusPill, Text } from '@/components/ui';
import { cardShadow, useTheme } from '@/theme';
import type { AlertMetric } from '@/types/api';
import { formatMetric, METRICS, type SensorStatus } from '@/utils/sensors';

interface SensorCardProps {
  metric: AlertMetric;
  value: number | null;
  status: SensorStatus;
  /** Direction of the last ~2 minutes (null = not enough data). */
  trend: 'up' | 'down' | 'flat' | null;
  /** Last ~2 minutes, oldest → newest, for the sparkline. */
  sparkline: readonly (number | null)[];
  onPress?: () => void;
}

const TREND_ICON = { up: 'trending-up', down: 'trending-down', flat: 'remove' } as const;
const TREND_WORD = { up: 'rising', down: 'falling', flat: 'steady' } as const;

/**
 * Live sensor tile (2×2 grid on Home): icon tile, status, label, big value,
 * trend arrow and a full-width sparkline along the bottom. Memoized: it only
 * re-renders when its own props change.
 */
export const SensorCard = memo(function SensorCard({
  metric,
  value,
  status,
  trend,
  sparkline,
  onPress,
}: SensorCardProps) {
  const theme = useTheme();
  const { colors } = theme;
  const meta = METRICS[metric];
  const color = colors.chart[meta.colorKey];
  const shown = formatMetric(metric, value);
  const a11y = [`${meta.label}, ${shown.spoken}`, status.label, trend ? TREND_WORD[trend] : null]
    .filter(Boolean)
    .join(', ');

  const body = (
    <>
      <View style={styles.pad}>
        <View style={styles.top}>
          <IconTile icon={meta.icon} color={color} background={`${color}1A`} size={36} />
          <StatusPill tone={status.tone} label={status.label} variant="plain" />
        </View>
        <Text variant="caption" color="secondary" numberOfLines={1} style={styles.label}>
          {meta.label}
        </Text>
        <View style={styles.valueRow}>
          <Text
            variant="metric"
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            style={styles.value}
          >
            {shown.value}
          </Text>
          <Text variant="caption" color="secondary" style={styles.unit}>
            {shown.unit}
          </Text>
          <View style={styles.spacer} />
          {trend ? <Icon name={TREND_ICON[trend]} size={16} color={colors.accent} /> : null}
        </View>
      </View>
      <MiniSparkline values={sparkline} color={color} />
    </>
  );

  const frame = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: cardShadow(theme) },
  ];

  if (!onPress) {
    return (
      <View style={frame} accessible accessibilityLabel={a11y}>
        {body}
      </View>
    );
  }
  return (
    <PressableCard onPress={onPress} label={a11y} style={frame}>
      {body}
    </PressableCard>
  );
});

function PressableCard({
  onPress,
  label,
  style,
  children,
}: {
  onPress: () => void;
  label: string;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens sensor details"
      style={({ pressed }) => [style, pressed ? styles.pressed : null]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minHeight: 168,
    justifyContent: 'space-between',
  },
  pad: { padding: 14, paddingBottom: 4 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  label: { marginTop: 14 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  value: { flexShrink: 1 },
  unit: { marginLeft: 1 },
  spacer: { flex: 1 },
  pressed: { opacity: 0.9 },
});
