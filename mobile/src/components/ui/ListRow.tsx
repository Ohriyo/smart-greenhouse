import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type StatusTone } from '@/theme';

import { Icon, type IconName } from './Icon';
import { IconTile } from './IconTile';
import { Text } from './Text';

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTone?: StatusTone;
  /** Right side: a node (toggle, value) — or a chevron by default when pressable. */
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/** Icon tile, title + subtitle, trailing element or chevron. */
export function ListRow({
  title,
  subtitle,
  icon,
  iconTone = 'accent',
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: ListRowProps) {
  const theme = useTheme();
  const content = (
    <>
      {icon ? <IconTile icon={icon} tone={iconTone} size={40} /> : null}
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ??
        (onPress ? (
          <Icon name="chevron-forward" size={18} color={theme.colors.textSecondary} />
        ) : null)}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityHint={accessibilityHint}
      android_ripple={{ color: theme.colors.surfaceMuted }}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  text: { flex: 1, gap: 2 },
  pressed: { opacity: 0.85 },
});
