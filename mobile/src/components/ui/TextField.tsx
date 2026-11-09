import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { TOUCH_TARGET, useTheme } from '@/theme';

import { Text } from './Text';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  hint?: string;
}

export function TextField({ label, error, hint, ...input }: TextFieldProps) {
  const theme = useTheme();
  const { colors, radii } = theme;
  return (
    <View style={styles.wrap}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        style={[
          styles.input,
          theme.typography.body,
          {
            color: colors.text,
            backgroundColor: colors.surfaceMuted,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radii.md,
          },
        ]}
        {...input}
      />
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: { minHeight: TOUCH_TARGET, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
});
