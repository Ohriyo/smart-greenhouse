import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { TOUCH_TARGET, useTheme, type Theme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type { IconName } from './Icon';

/**
 * THE way to make a button (see README "Button rule"). Every button is a pill:
 * a stadium with fully rounded ends, radius = height / 2. Icon-only buttons use
 * <IconButton>, which is a perfect circle. `npm run check:buttons` fails if a
 * screen builds its own button-like Pressable with a custom borderRadius.
 */
export type ButtonVariant =
  | 'primary' // solid green, white text: the main action
  | 'secondary' // outlined: green border + green text
  | 'tonal' // light green fill, green text
  | 'destructive' // solid coral
  | 'ghost' // text-only link look; still a pill when pressed
  | 'inverse' // dark pill (dev "Demo" button)
  | 'demo'; // lavender outline (dev presentation tools only)

export type ButtonSize = 'large' | 'medium' | 'small';

const HEIGHT: Record<ButtonSize, number> = { large: 52, medium: 46, small: 36 };
const PAD_X: Record<ButtonSize, number> = { large: 28, medium: 24, small: 16 };
const ICON: Record<ButtonSize, number> = { large: 20, medium: 18, small: 16 };

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

interface VariantColors {
  bg: string;
  bgPressed: string;
  fg: string;
  border: string;
}

function variantColors(theme: Theme, variant: ButtonVariant): VariantColors {
  const c = theme.colors;
  switch (variant) {
    case 'primary':
      return { bg: c.accent, bgPressed: c.accentPressed, fg: c.onAccent, border: c.accent };
    case 'secondary':
      return { bg: c.surface, bgPressed: c.accentSoft, fg: c.accent, border: c.accent };
    case 'tonal':
      return { bg: c.accentSoft, bgPressed: c.surfaceTint, fg: c.accent, border: c.accentSoft };
    case 'destructive':
      return { bg: c.danger, bgPressed: c.dangerPressed, fg: c.onAccent, border: c.danger };
    case 'ghost':
      return { bg: 'transparent', bgPressed: c.accentSoft, fg: c.accent, border: 'transparent' };
    case 'inverse':
      return { bg: c.inverse, bgPressed: c.text, fg: c.onInverse, border: c.inverse };
    case 'demo':
      return { bg: c.demoSoft, bgPressed: c.demoSoft, fg: c.demo, border: c.demo };
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const colors = variantColors(theme, variant);
  const inactive = disabled || loading;
  const height = HEIGHT[size];
  // Small buttons are 36 high; hitSlop brings the touch target to 48.
  const slop = Math.max(0, (TOUCH_TARGET - height) / 2);

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      hitSlop={slop > 0 ? { top: slop, bottom: slop } : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          borderRadius: height / 2,
          paddingHorizontal: PAD_X[size],
          backgroundColor: pressed && !inactive ? colors.bgPressed : colors.bg,
          borderColor: colors.border,
        },
        variant === 'primary' && !inactive
          ? { boxShadow: `0px 2px 8px ${theme.colors.shadow}` }
          : null,
        pressed && !inactive ? styles.pressed : null,
        fullWidth ? styles.fullWidth : styles.hug,
        disabled && !loading ? styles.disabled : null,
        style,
      ]}
    >
      {/* The label stays laid out while loading, so the width never jumps. */}
      <View style={[styles.content, loading ? styles.hidden : null]}>
        {icon ? <Icon name={icon} size={ICON[size]} color={colors.fg} /> : null}
        <Text
          variant={size === 'small' ? 'label' : 'bodyStrong'}
          tint={colors.fg}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.fg} />
        </View>
      ) : null}
    </Pressable>
  );
}

// ---------- Icon-only: a perfect circle ----------

export type IconButtonVariant = 'plain' | 'outline' | 'ghost' | 'tonal' | 'primary';
const CIRCLE: Record<ButtonSize, number> = { large: 48, medium: 40, small: 32 };

interface IconButtonProps {
  icon: IconName;
  onPress: () => void;
  /** Required: icon-only buttons have no visible text. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  variant?: IconButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Icon color override (default follows the variant). */
  tint?: string;
}

function iconButtonColors(theme: Theme, variant: IconButtonVariant): VariantColors {
  const c = theme.colors;
  switch (variant) {
    case 'plain':
      return { bg: c.surfaceMuted, bgPressed: c.border, fg: c.text, border: c.surfaceMuted };
    case 'outline':
      return { bg: c.surface, bgPressed: c.surfaceMuted, fg: c.text, border: c.border };
    case 'ghost':
      return {
        bg: 'transparent',
        bgPressed: c.surfaceMuted,
        fg: c.textSecondary,
        border: 'transparent',
      };
    case 'tonal':
      return { bg: c.accentSoft, bgPressed: c.surfaceTint, fg: c.accent, border: c.accentSoft };
    case 'primary':
      return { bg: c.accent, bgPressed: c.accentPressed, fg: c.onAccent, border: c.accent };
  }
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  variant = 'plain',
  size = 'medium',
  disabled = false,
  tint,
}: IconButtonProps) {
  const theme = useTheme();
  const colors = iconButtonColors(theme, variant);
  const d = CIRCLE[size];
  const slop = Math.max(0, (TOUCH_TARGET - d) / 2);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={slop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.circle,
        {
          width: d,
          height: d,
          borderRadius: d / 2,
          backgroundColor: pressed && !disabled ? colors.bgPressed : colors.bg,
          borderColor: colors.border,
        },
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Icon name={icon} size={Math.round(d * 0.5)} color={tint ?? colors.fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  hug: { alignSelf: 'flex-start' },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  hidden: { opacity: 0 },
  spinner: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  pressed: { transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  circle: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
