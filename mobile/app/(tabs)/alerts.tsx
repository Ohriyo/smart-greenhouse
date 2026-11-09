import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlertRow } from '@/components/greenhouse';
import {
  Button,
  EmptyState,
  ErrorState,
  Screen,
  SegmentedControl,
  Skeleton,
  useToast,
  type SegmentOption,
} from '@/components/ui';
import { selectUnreadCount, useMockStore } from '@/store/mockStore';
import { useTheme } from '@/theme';
import type { Alert } from '@/types/api';
import { useNow } from '@/utils/time';

type Filter = 'all' | 'unread' | 'critical';

const FILTERS: readonly SegmentOption<Filter>[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'critical', label: 'Critical' },
];

const EMPTY: Record<Filter, { title: string; message: string }> = {
  all: {
    title: 'No alerts yet',
    message: "You'll see warnings here when a value leaves its range.",
  },
  unread: { title: 'All caught up', message: 'There are no unread alerts.' },
  critical: { title: 'No critical alerts', message: 'Nothing has gone far out of range.' },
};

const keyExtractor = (a: Alert) => String(a.id);

export default function AlertsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const now = useNow(15_000); // relative times only need coarse updates here
  const [filter, setFilter] = useState<Filter>('all');
  const scenario = useMockStore((s) => s.scenario);
  const alerts = useMockStore((s) => s.alerts);
  const unread = useMockStore(selectUnreadCount);
  const markRead = useMockStore((s) => s.markRead);
  const markAllRead = useMockStore((s) => s.markAllRead);

  const visible = useMemo(() => {
    switch (filter) {
      case 'unread':
        return alerts.filter((a) => a.readAt === null);
      case 'critical':
        return alerts.filter((a) => a.severity === 'critical');
      case 'all':
        return alerts;
    }
  }, [alerts, filter]);

  const renderItem: ListRenderItem<Alert> = useCallback(
    ({ item }) => <AlertRow alert={item} now={now} onPress={markRead} />,
    [now, markRead],
  );

  const separator = useCallback(
    () => <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />,
    [theme.colors.border],
  );

  const horizontal = { paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right };

  return (
    <Screen
      title="Alerts"
      subtitle={unread > 0 ? `${unread} unread` : 'All read'}
      scroll={false}
      headerRight={
        <Button
          label="Mark all read"
          variant="ghost"
          icon="checkmark-done"
          disabled={unread === 0 || scenario !== 'normal'}
          onPress={() => {
            markAllRead();
            toast.show('All alerts marked as read', 'success');
          }}
        />
      }
    >
      <View style={[horizontal, styles.filters]}>
        <SegmentedControl
          options={FILTERS}
          value={filter}
          onChange={setFilter}
          accessibilityLabel="Filter alerts"
        />
      </View>

      {scenario === 'loading' ? (
        <View style={[horizontal, styles.loading]} accessible accessibilityLabel="Loading alerts">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={40} height={40} radius={20} />
              <View style={styles.skeletonText}>
                <Skeleton width="85%" height={14} />
                <Skeleton width="45%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ) : scenario === 'error' ? (
        <ErrorState message="Alerts couldn't be loaded from the backend." />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={separator}
          contentContainerStyle={[horizontal, styles.listContent]}
          ListEmptyComponent={
            <EmptyState
              icon={filter === 'all' ? 'notifications-off-outline' : 'checkmark-circle-outline'}
              title={EMPTY[filter].title}
              message={EMPTY[filter].message}
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { marginBottom: 8 },
  listContent: { paddingBottom: 32, flexGrow: 1 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  loading: { gap: 16, paddingTop: 8 },
  skeletonRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  skeletonText: { flex: 1, gap: 8 },
});
