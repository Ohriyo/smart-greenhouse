import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { cardShadow, useTheme } from '@/theme';

import { Text } from './Text';

interface StatTileProps {
  label: string;
  value: string;
  /** Small muted unit after the value. */
  unit?: string;
  /** Spoken text if it differs ("Minimum, 26.4 degrees Celsius"). */
  accessibilityLabel?: string;
}

/** Small card: "Minimum / 26.4°". */
export const StatTile = memo(function StatTile({
  label,
  value,
  unit,
  accessibilityLabel,
}: StatTileProps) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? `${label}, ${value}${unit ? ` ${unit}` : ''}`}
      style={[
        styles.tile,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          boxShadow: cardShadow(theme),
        },
      ]}
    >
      <Text variant="caption" color="secondary" numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.row}>
        <Text variant="value" tabular numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {unit ? (
          <Text variant="caption" color="secondary">
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    gap: 6,
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 76,
  },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
});
