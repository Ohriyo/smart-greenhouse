import { StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

interface MinMaxInputProps {
  /** Row label ("Air temperature"). */
  label: string;
  unit: string;
  min: string;
  max: string;
  onChangeMin: (text: string) => void;
  onChangeMax: (text: string) => void;
  minError?: string | null;
  maxError?: string | null;
  /** Spoken unit, e.g. "degrees Celsius". */
  spokenUnit?: string;
}

/** "Air temperature   [MIN 18] [MAX 35] °C". Empty = no limit. */
export function MinMaxInput({
  label,
  unit,
  min,
  max,
  onChangeMin,
  onChangeMax,
  minError,
  maxError,
  spokenUnit,
}: MinMaxInputProps) {
  const theme = useTheme();
  const error = minError ?? maxError;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
        <Field
          caption="MIN"
          value={min}
          onChangeText={onChangeMin}
          invalid={!!minError}
          accessibilityLabel={`${label} minimum${spokenUnit ? `, ${spokenUnit}` : ''}`}
          hint={minError ?? 'Leave empty for no limit'}
        />
        <Field
          caption="MAX"
          value={max}
          onChangeText={onChangeMax}
          invalid={!!maxError}
          accessibilityLabel={`${label} maximum${spokenUnit ? `, ${spokenUnit}` : ''}`}
          hint={maxError ?? 'Leave empty for no limit'}
        />
        <Text
          variant="caption"
          color="secondary"
          style={styles.unit}
          importantForAccessibility="no"
        >
          {unit}
        </Text>
      </View>
      {error ? (
        <Text variant="caption" tint={theme.colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Field({
  caption,
  value,
  onChangeText,
  invalid,
  accessibilityLabel,
  hint,
}: {
  caption: string;
  value: string;
  onChangeText: (t: string) => void;
  invalid: boolean;
  accessibilityLabel: string;
  hint: string;
}) {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <View style={styles.field}>
      <Text variant="micro" color="tertiary" style={styles.caption} importantForAccessibility="no">
        {caption}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        inputMode="decimal"
        selectTextOnFocus
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={hint}
        placeholder="—"
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        style={[
          styles.input,
          theme.typography.body,
          {
            color: colors.text,
            backgroundColor: colors.surfaceMuted,
            borderColor: invalid ? colors.danger : colors.border,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  label: { flex: 1, paddingBottom: 13 },
  field: { width: 64, gap: 2 },
  caption: { fontSize: 9, letterSpacing: 0.8, marginLeft: 2 },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    textAlign: 'left',
  },
  unit: { width: 26, paddingBottom: 15 },
});
