import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { TOUCH_TARGET, useTheme, type Theme } from '@/theme';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type IconName = ComponentProps<typeof Ionicons>['name'];

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

function variantColors(theme: Theme, variant: ButtonVariant) {
  const c = theme.colors;
  switch (variant) {
    case 'primary':
      return { bg: c.accent, bgPressed: c.accentPressed, fg: c.onAccent, border: c.accent };
    case 'secondary':
      return { bg: c.surface, bgPressed: c.surfaceMuted, fg: c.text, border: c.border };
    case 'ghost':
      return { bg: 'transparent', bgPressed: c.surfaceMuted, fg: c.accent, border: 'transparent' };
    case 'danger':
      return { bg: c.dangerSoft, bgPressed: c.dangerSoft, fg: c.danger, border: c.dangerSoft };
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const theme = useTheme();
  const colors = variantColors(theme, variant);
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      android_ripple={{ color: colors.bgPressed }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? colors.bgPressed : colors.bg,
          borderColor: colors.border,
          borderRadius: theme.radii.md,
          paddingHorizontal: theme.spacing.lg,
        },
        fullWidth ? styles.fullWidth : null,
        disabled && !loading ? styles.disabled : null,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.fg} />
        ) : icon ? (
          <Ionicons name={icon} size={20} color={colors.fg} />
        ) : null}
        <Text variant="bodyStrong" tint={colors.fg} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disabled: { opacity: 0.45 },
});
