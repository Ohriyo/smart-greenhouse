import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { Text } from './Text';

interface ScreenProps {
  title: string;
  subtitle?: string;
  /** Element shown at the right of the title (e.g. a status pill or button). */
  headerRight?: ReactNode;
  /** Content shown between the header and the body (e.g. a connection banner). */
  banner?: ReactNode;
  /** false for screens that render their own list (FlatList) as children. */
  scroll?: boolean;
  refreshControl?: ScrollViewProps['refreshControl'];
  children: ReactNode;
}

/**
 * Screen frame: background, top/side safe areas (Android edge-to-edge draws under
 * the status bar), large title header. The bottom inset is handled by the tab bar.
 */
export function Screen({
  title,
  subtitle,
  headerRight,
  banner,
  scroll = true,
  refreshControl,
  children,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { spacing } = theme;

  const horizontal = {
    paddingLeft: spacing.lg + insets.left,
    paddingRight: spacing.lg + insets.right,
  };

  const header = (
    <View style={[styles.header, horizontal, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.headerText}>
        <Text variant="title" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {banner ? <View style={[horizontal, { marginBottom: spacing.md }]}>{banner}</View> : null}
          <View style={[horizontal, { gap: spacing.lg }]}>{children}</View>
        </ScrollView>
      ) : (
        <>
          {header}
          {banner ? <View style={[horizontal, { marginBottom: spacing.md }]}>{banner}</View> : null}
          <View style={styles.root}>{children}</View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingBottom: 16,
  },
  headerText: { flex: 1, gap: 2 },
  headerRight: { flexShrink: 0 },
});
