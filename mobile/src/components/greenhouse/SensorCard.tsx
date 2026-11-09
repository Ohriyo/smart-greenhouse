import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, StatusPill, Text } from '@/components/ui';
import { toneColors, useTheme } from '@/theme';
import type { AlertMetric } from '@/types/api';
import { formatRange, formatValue, METRICS, type SensorStatus } from '@/utils/sensors';

interface SensorCardProps {
  metric: AlertMetric;
  value: number | null;
  status: SensorStatus;
  min: number | null;
  max: number | null;
  /**
   * Bottom line, typically <UpdatedAgo />. It updates itself every second, so
   * the card itself only re-renders when its value or status changes.
   */
  footer?: ReactNode;
  onPress?: () => void;
}

export const SensorCard = memo(function SensorCard({
  metric,
  value,
  status,
  min,
  max,
  footer,
  onPress,
}: SensorCardProps) {
  const theme = useTheme();
  const meta = METRICS[metric];
  const tone = toneColors(theme, status.tone);
  const display = formatValue(value, meta.decimals);
  const range = formatRange(min, max, meta.unit);
  const highlight = status.tone === 'warning' || status.tone === 'danger';

  const spokenValue = value === null ? 'no reading' : `${display} ${meta.unit}`;
  const a11y = [`${meta.label}, ${spokenValue}`, status.label, range ? `target ${range}` : null]
    .filter(Boolean)
    .join(', ');

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={a11y}
      accessibilityHint={onPress ? 'Opens history' : undefined}
      accentColor={highlight ? tone.fg : undefined}
      style={styles.card}
    >
      <View style={styles.top} importantForAccessibility="no-hide-descendants">
        <View style={[styles.iconChip, { backgroundColor: tone.bg }]}>
          <MaterialCommunityIcons name={meta.icon} size={20} color={tone.fg} />
        </View>
        <StatusPill tone={status.tone} label={status.label} />
      </View>

      <View importantForAccessibility="no-hide-descendants">
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {meta.label}
        </Text>
        <View style={styles.valueRow}>
          <Text variant="value" tabular numberOfLines={1} adjustsFontSizeToFit>
            {display}
          </Text>
          {value !== null ? (
            <Text variant="bodyStrong" color="secondary" style={styles.unit}>
              {meta.unit}
            </Text>
          ) : null}
        </View>
        <Text variant="caption" color="tertiary" numberOfLines={1}>
          {range ? `Target ${range}` : 'No target set'}
        </Text>
        {footer}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, gap: 12, minHeight: 156 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginVertical: 2 },
  unit: { marginBottom: 2 },
});
