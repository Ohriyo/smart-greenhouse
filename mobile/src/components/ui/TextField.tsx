import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { TOUCH_TARGET, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  hint?: string;
  /** Leading icon inside the field (e.g. "mci-server" for the server URL). */
  icon?: IconName;
}

/** Labelled input. Rounded rectangle (inputs are not buttons). */
export function TextField({ label, error, hint, icon, ...input }: TextFieldProps) {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <View style={styles.wrap}>
      <Text variant="caption" color="secondary" importantForAccessibility="no">
        {label}
      </Text>
      <View
        style={[
          styles.box,
          {
            backgroundColor: colors.surfaceMuted,
            borderColor: error ? colors.danger : colors.border,
          },
        ]}
      >
        {icon ? <Icon name={icon} size={18} color={colors.textSecondary} /> : null}
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          style={[styles.input, theme.typography.body, { color: colors.text }]}
          {...input}
        />
      </View>
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
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 10 },
});
