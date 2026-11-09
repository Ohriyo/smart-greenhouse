import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

interface BadgeProps {
  count: number;
  /** "danger" = red unread badge (tab bar), "accent" = green count (filter chip). */
  tone?: 'danger' | 'accent';
}

/** Small count bubble. Decorative: the parent's accessibilityLabel says the count. */
export function Badge({ count, tone = 'danger' }: BadgeProps) {
  const theme = useTheme();
  const bg = tone === 'danger' ? theme.colors.danger : theme.colors.accent;
  const text = count > 99 ? '99+' : String(count);
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={[styles.badge, { backgroundColor: bg, borderColor: theme.colors.surface }]}
    >
      <Text variant="micro" tint={theme.colors.onAccent} tabular style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 10, lineHeight: 12 },
});
