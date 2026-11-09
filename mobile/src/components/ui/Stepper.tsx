import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { TOUCH_TARGET, useTheme } from '@/theme';
import { formatValue } from '@/utils/sensors';

import type { IconName } from './Button';
import { Text } from './Text';

interface StepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  min: number;
  max: number;
  unit: string;
  decimals?: number;
}

/** Number input with −/+ buttons; TalkBack users swipe up/down to adjust. */
export function Stepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  unit,
  decimals = 0,
}: StepperProps) {
  const round = (v: number) => Math.round(v * 10 ** decimals) / 10 ** decimals;
  const dec = () => onChange(Math.max(min, round(value - step)));
  const inc = () => onChange(Math.min(max, round(value + step)));
  const text = `${formatValue(value, decimals)} ${unit}`;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? inc() : dec())}
    >
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      <View style={styles.controls}>
        <StepButton icon="remove" onPress={dec} disabled={value <= min} />
        <Text variant="bodyStrong" tabular style={styles.value}>
          {text}
        </Text>
        <StepButton icon="add" onPress={inc} disabled={value >= max} />
      </View>
    </View>
  );
}

function StepButton({
  icon,
  onPress,
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      importantForAccessibility="no"
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? theme.colors.border : theme.colors.surfaceMuted,
          borderRadius: theme.radii.md,
        },
        disabled ? styles.disabled : null,
      ]}
    >
      <Ionicons name={icon} size={22} color={theme.colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TOUCH_TARGET },
  label: { flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { minWidth: 72, textAlign: 'center' },
  disabled: { opacity: 0.35 },
});
