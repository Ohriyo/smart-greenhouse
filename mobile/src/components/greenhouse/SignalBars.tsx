import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

interface SignalBarsProps {
  /** Filled bars, 0–4. */
  bars: number;
  /** Color of the filled bars. */
  color: string;
}

const HEIGHTS = [5, 8, 11, 14] as const;

/** Four ascending bars (like a phone's signal icon). Decorative: the dBm text carries the value. */
export const SignalBars = memo(function SignalBars({ bars, color }: SignalBarsProps) {
  const theme = useTheme();
  return (
    <View style={styles.row} importantForAccessibility="no-hide-descendants">
      {HEIGHTS.map((h, i) => (
        <View
          key={h}
          style={[
            styles.bar,
            { height: h, backgroundColor: i < bars ? color : theme.colors.border },
          ]}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14 },
  bar: { width: 3, borderRadius: 1.5 },
});
