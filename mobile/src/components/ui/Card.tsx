import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { cardShadow, useTheme } from '@/theme';

import { SectionHeader } from './SectionHeader';

interface CardProps {
  children?: ReactNode;
  /** Small UPPERCASE label above the title ("LIVE TREND"). */
  eyebrow?: string;
  /** Section title under the eyebrow ("Last 30 minutes"). */
  title?: string;
  /** Right side of the header: meta text, a tag or an action. */
  meta?: ReactNode;
  onPress?: () => void;
  /** Required when `onPress` is set: what TalkBack reads for the whole card. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Extra TalkBack actions (e.g. "Mark as read") for gestures a screen reader can't do. */
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  /** 3 px colored left edge (e.g. warning alerts). */
  accentColor?: string;
  /** "tint" = soft green background (status card). */
  tone?: 'default' | 'tint';
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Rounded surface with a soft shadow and hairline border. Not a button: keeps its rounded-rectangle shape. */
export function Card({
  children,
  eyebrow,
  title,
  meta,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityActions,
  onAccessibilityAction,
  accentColor,
  tone = 'default',
  padded = true,
  style,
}: CardProps) {
  const theme = useTheme();
  const { colors, radii, spacing } = theme;
  const base: StyleProp<ViewStyle> = [
    styles.card,
    {
      backgroundColor: tone === 'tint' ? colors.surfaceTint : colors.surface,
      borderColor: tone === 'tint' ? colors.accentSoft : colors.border,
      borderRadius: radii.lg,
      padding: padded ? spacing.lg : 0,
      boxShadow: cardShadow(theme),
    },
    accentColor ? { borderLeftWidth: 3, borderLeftColor: accentColor } : null,
    style,
  ];

  const header =
    eyebrow || title || meta ? (
      <SectionHeader eyebrow={eyebrow} title={title} right={meta} style={styles.header} />
    ) : null;

  if (!onPress) {
    return (
      <View style={base} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel}>
        {header}
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      android_ripple={{ color: colors.surfaceMuted, borderless: false }}
      style={({ pressed }) => [base, pressed ? styles.pressed : null]}
    >
      {header}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  header: { marginBottom: 12 },
  pressed: { opacity: 0.9 },
});

/** Hairline divider inside cards. */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }, style]}
      importantForAccessibility="no"
    />
  );
}
