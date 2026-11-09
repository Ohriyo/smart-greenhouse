import { StyleSheet, View } from 'react-native';

import { formatValue } from '@/utils/sensors';

import { IconButton } from './Button';
import { Text } from './Text';

interface StepperProps {
  /** Spoken label ("Fan turns ON at"); shown at the left unless `showLabel` is false. */
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  min: number;
  max: number;
  /** Shown small next to the value ("°"), spoken in full via `spokenUnit`. */
  unit: string;
  spokenUnit?: string;
  decimals?: number;
  showLabel?: boolean;
}

/** − value + with circular buttons. TalkBack users swipe up/down to adjust. */
export function Stepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  unit,
  spokenUnit,
  decimals = 0,
  showLabel = true,
}: StepperProps) {
  const round = (v: number) => Math.round(v * 10 ** decimals) / 10 ** decimals;
  const dec = () => onChange(Math.max(min, round(value - step)));
  const inc = () => onChange(Math.min(max, round(value + step)));
  const shown = formatValue(value, decimals);

  return (
    <View style={styles.row}>
      {showLabel ? (
        <Text style={styles.label} numberOfLines={2} importantForAccessibility="no">
          {label}
        </Text>
      ) : null}
      <View
        style={styles.controls}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: `${shown} ${spokenUnit ?? unit}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? inc() : dec())}
      >
        <IconButton
          icon="remove"
          onPress={dec}
          disabled={value <= min}
          variant="outline"
          size="small"
          accessibilityLabel={`Decrease ${label}`}
        />
        <View style={styles.valueWrap}>
          <Text variant="value" tabular>
            {shown}
          </Text>
          <Text variant="caption" color="secondary" style={styles.unit}>
            {unit}
          </Text>
        </View>
        <IconButton
          icon="add"
          onPress={inc}
          disabled={value >= max}
          variant="outline"
          size="small"
          accessibilityLabel={`Increase ${label}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  label: { flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  valueWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 52,
    justifyContent: 'center',
  },
  unit: { marginTop: 2, marginLeft: 1 },
});
