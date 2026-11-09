import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
  type SectionListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlertCard, EnableNotificationsCard } from '@/components/greenhouse';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Screen,
  Skeleton,
  Text,
  useToast,
} from '@/components/ui';
import { AlertDetailSheet } from '@/features/alerts/AlertDetailSheet';
import { alertDay, type AlertDay } from '@/features/alerts/presentation';
import {
  useAlertsQuery,
  useMarkAlertRead,
  useMarkAllAlertsRead,
  useUnreadCount,
  type AlertFilter,
} from '@/features/alerts/queries';
import { LiveBanner } from '@/features/dashboard/LiveBanner';
import { describeError, errorTitle } from '@/services/api';
import { pushSupport } from '@/services/notifications';
import { useLiveStore } from '@/store/liveStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme';
import type { Alert } from '@/types/api';
import { manilaStartOfDay } from '@/utils/manilaTime';
import { useNow } from '@/utils/time';

const FILTERS: readonly { value: AlertFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
];

const EMPTY: Record<AlertFilter, { title: string; message: string }> = {
  all: { title: 'No alerts', message: 'Your greenhouse is happy.' },
  critical: { title: 'No critical alerts', message: 'Nothing has gone far out of range.' },
  warning: { title: 'No warnings', message: 'Nothing is outside its limits.' },
  info: { title: 'No info alerts', message: 'Recoveries and reconnects show up here.' },
};

interface DaySection {
  title: AlertDay;
  data: Alert[];
}

const DAY_ORDER: AlertDay[] = ['Today', 'Yesterday', 'Earlier'];
const keyExtractor = (a: Alert) => String(a.id);

export default function AlertsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const now = useNow(15_000); // relative times only need coarse updates here
  const [filter, setFilter] = useState<AlertFilter>('all');
  const apiUrl = useSettingsStore((s) => s.apiUrl);
  const hydrated = useSettingsStore((s) => s.hydrated);
  const deviceId = useLiveStore((s) => s.deviceIds[0]);

  const query = useAlertsQuery(filter);
  const unread = useUnreadCount().data ?? 0;
  const markRead = useMarkAlertRead();
  const markAll = useMarkAllAlertsRead();

  // Explain-then-request card (only where push can work at all).
  const [canPush] = useState(() => pushSupport().ok);
  const permission = useNotificationStore((s) => s.permission);
  const promptDismissed = useNotificationStore((s) => s.promptDismissed);
  const dismissPrompt = useNotificationStore((s) => s.dismissPrompt);
  const showPrompt =
    canPush && !promptDismissed && (permission === 'ask' || permission === 'blocked');

  // Grouped by Asia/Manila day: Today / Yesterday / Earlier.
  const sections = useMemo<DaySection[]>(() => {
    const todayStart = manilaStartOfDay(now);
    const groups: Record<AlertDay, Alert[]> = { Today: [], Yesterday: [], Earlier: [] };
    for (const page of query.data?.pages ?? []) {
      for (const alert of page.items) groups[alertDay(alert.ts, todayStart)].push(alert);
    }
    return DAY_ORDER.filter((d) => groups[d].length > 0).map((d) => ({
      title: d,
      data: groups[d],
    }));
  }, [query.data, now]);

  // ---- Detail sheet (the alert is kept while the sheet closes) ----
  const [detail, setDetail] = useState<Alert | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { mutate: markOne } = markRead;
  // Stable (they don't depend on the list), so memoized cards don't re-render on every update.
  const onMarkRead = useCallback(
    (alert: Alert) => {
      if (alert.readAt === null) markOne(alert.id);
    },
    [markOne],
  );
  const onOpen = useCallback(
    (alert: Alert) => {
      setDetail(alert);
      setDetailOpen(true);
      if (alert.readAt === null) markOne(alert.id); // opening it counts as reading it
    },
    [markOne],
  );
  const closeDetail = useCallback(() => setDetailOpen(false), []);

  const renderItem: SectionListRenderItem<Alert, DaySection> = useCallback(
    ({ item }) => <AlertCard alert={item} now={now} onOpen={onOpen} onMarkRead={onMarkRead} />,
    [now, onOpen, onMarkRead],
  );
  const renderSectionHeader = useCallback(
    ({ section }: { section: DaySection }) => (
      <View style={styles.sectionHeader}>
        <Text variant="label" color="secondary">
          {section.title}
        </Text>
        <View style={[styles.sectionLine, { backgroundColor: theme.colors.border }]} />
      </View>
    ),
    [theme.colors.border],
  );
  const separator = useCallback(() => <View style={styles.separator} />, []);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const [refreshing, setRefreshing] = useState(false);
  const { refetch } = query;
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const horizontal = { paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right };

  if (hydrated && !apiUrl) {
    return (
      <Screen title="Alerts" subtitle="Not connected">
        <EmptyState
          icon="server-outline"
          title="Set your server address"
          message="Enter your laptop's address in Settings to see alerts."
          action={{ label: 'Open Settings', onPress: () => router.push('/settings') }}
        />
      </Screen>
    );
  }

  const markAllRead = () =>
    markAll.mutate(undefined, {
      onSuccess: (res) =>
        toast.show(
          res.updated === 1 ? '1 alert marked as read' : `${res.updated} alerts marked as read`,
          'success',
        ),
      onError: (err) => toast.show(describeError(err), 'error'),
    });

  let body;
  if (query.isPending) {
    body = (
      <View style={[horizontal, styles.loading]} accessible accessibilityLabel="Loading alerts">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <View style={styles.skeletonRow}>
              <Skeleton width={44} height={44} radius={13} />
              <View style={styles.skeletonText}>
                <Skeleton width="55%" height={16} />
                <Skeleton width="80%" height={12} />
                <Skeleton width="35%" height={10} />
              </View>
            </View>
          </Card>
        ))}
      </View>
    );
  } else if (query.isError && sections.length === 0) {
    body = (
      <ErrorState
        title={errorTitle(query.error)}
        message={describeError(query.error)}
        onRetry={() => void onRefresh()}
        retrying={refreshing}
      />
    );
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ItemSeparatorComponent={separator}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[horizontal, styles.listContent]}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        // Cards are ~110 dp: render a screenful first, keep a modest window around it.
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            colors={[theme.colors.accent]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
        ListHeaderComponent={
          showPrompt ? (
            <View style={styles.prompt}>
              <EnableNotificationsCard
                permission={permission === 'blocked' ? 'blocked' : 'ask'}
                onDismiss={dismissPrompt}
              />
            </View>
          ) : undefined
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator
              style={styles.footer}
              color={theme.colors.accent}
              accessibilityLabel="Loading older alerts"
            />
          ) : undefined
        }
        ListEmptyComponent={
          <EmptyState
            icon={filter === 'all' ? 'leaf-outline' : 'checkmark-circle-outline'}
            title={EMPTY[filter].title}
            message={EMPTY[filter].message}
          />
        }
      />
    );
  }

  return (
    <Screen
      title="Alerts"
      subtitle="Events that need your attention"
      scroll={false}
      banner={<LiveBanner deviceId={deviceId} restFailed={query.isError} />}
      headerRight={
        <Button
          label="Mark all read"
          variant="ghost"
          size="small"
          loading={markAll.isPending}
          disabled={unread === 0}
          onPress={markAllRead}
        />
      }
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={[horizontal, styles.filters]}
        accessibilityRole="radiogroup"
        accessibilityLabel="Filter alerts"
      >
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            selected={f.value === filter}
            count={f.value === 'all' && unread > 0 ? unread : undefined}
            accessibilityLabel={f.value === 'all' && unread > 0 ? `All, ${unread} unread` : f.label}
            onPress={() => setFilter(f.value)}
          />
        ))}
      </ScrollView>
      {body}
      <AlertDetailSheet alert={detail} visible={detailOpen} onClose={closeDetail} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterScroll: { flexGrow: 0, marginBottom: 4 },
  filters: { gap: 8, paddingVertical: 4 },
  listContent: { paddingBottom: 32, flexGrow: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    paddingBottom: 10,
  },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth },
  separator: { height: 12 },
  loading: { gap: 12, paddingTop: 12 },
  skeletonRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  skeletonText: { flex: 1, gap: 8 },
  prompt: { paddingTop: 4, paddingBottom: 4 },
  footer: { paddingVertical: 16 },
});
