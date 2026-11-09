import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';

import {
  BottomSheet,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  Screen,
  SegmentedControl,
  Skeleton,
  StatTile,
  useToast,
  type SegmentOption,
} from '@/components/ui';
import { LiveBanner } from '@/features/dashboard/LiveBanner';
import { useDevicesQuery } from '@/features/dashboard/queries';
import { RANGE_SPOKEN } from '@/features/history/axis';
import { FanActivityCard, HeatmapCard, HistoryOverview } from '@/features/history/HistorySections';
import { useFanActivity, useHeatmap, useHistory } from '@/features/history/useHistory';
import { describeError, errorTitle } from '@/services/api';
import { useLiveStore } from '@/store/liveStore';
import { useTheme } from '@/theme';
import {
  AlertMetricSchema,
  type AlertMetric,
  type HistoryPoint,
  type HistoryRange,
} from '@/types/api';
import { formatMetricText, METRICS } from '@/utils/sensors';
import { formatDuration } from '@/utils/time';

const RANGE_OPTIONS: readonly SegmentOption<HistoryRange>[] = [
  { value: '24h', label: '24h', accessibilityLabel: 'Last 24 hours' },
  { value: '7d', label: '7d', accessibilityLabel: 'Last 7 days' },
  { value: '30d', label: '30d', accessibilityLabel: 'Last 30 days' },
];
const METRIC_ORDER: AlertMetric[] = ['airTemp', 'humidity', 'soilMoisture', 'lux'];

/** Lowest min, highest max and the reading-weighted average over all buckets. */
function summarize(points: readonly HistoryPoint[]) {
  if (points.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let weighted = 0;
  let count = 0;
  for (const p of points) {
    min = Math.min(min, p.min);
    max = Math.max(max, p.max);
    weighted += p.avg * p.count;
    count += p.count;
  }
  return { min, max, avg: count > 0 ? weighted / count : 0 };
}

export default function HistoryScreen() {
  const theme = useTheme();
  const toast = useToast();

  // Opened from Home / Sensor Detail with ?metric=…, validated like any external input.
  const params = useLocalSearchParams<{ metric?: string }>();
  const paramMetric = AlertMetricSchema.safeParse(params.metric);
  const [metric, setMetric] = useState<AlertMetric>(
    paramMetric.success ? paramMetric.data : 'airTemp',
  );
  const [range, setRange] = useState<HistoryRange>('24h');
  // A new ?metric= on the already-mounted tab switches to it (state adjusted during render).
  const [seenParam, setSeenParam] = useState(params.metric);
  if (params.metric !== seenParam) {
    setSeenParam(params.metric);
    if (paramMetric.success) setMetric(paramMetric.data);
  }

  const devicesQuery = useDevicesQuery();
  const deviceId = useLiveStore((s) => s.deviceIds[0]);
  const current = useLiveStore((s) => (deviceId ? s.readings[deviceId]?.[metric] : null) ?? null);
  const history = useHistory(deviceId, metric, range);
  const activity = useFanActivity(deviceId, range);
  const heatmap = useHeatmap(deviceId, metric);

  const stats = useMemo(() => summarize(history.data?.points ?? []), [history.data]);
  const fmt = (v: number) => formatMetricText(metric, v);
  const meta = METRICS[metric];

  const [menu, setMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([history.refetch(), activity.refetch(), heatmap.refetch()]);
    setRefreshing(false);
  };

  const share = async () => {
    setMenu(false);
    if (!stats) {
      toast.show('No data to share for this range yet.', 'info');
      return;
    }
    const fan = activity.data ? `\nFan was on: ${formatDuration(activity.data.totalOnSec)}` : '';
    try {
      await Share.share({
        message:
          `ETanim · ${meta.label}, ${RANGE_SPOKEN[range]} (Asia/Manila)\n` +
          `Minimum: ${fmt(stats.min)}\nMaximum: ${fmt(stats.max)}\nAverage: ${fmt(stats.avg)}${fan}`,
      });
    } catch {
      toast.show('Could not open the share menu.', 'error');
    }
  };

  const loading = !history.data && history.isPending;
  const failed = history.isError && !history.data;
  const noDevice = devicesQuery.isSuccess && devicesQuery.data.length === 0;
  const empty = !!history.data && history.data.points.length === 0;

  return (
    <Screen
      title="History"
      subtitle="Explore trends over time"
      banner={<LiveBanner deviceId={deviceId} restFailed={history.isError} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          colors={[theme.colors.accent]}
          progressBackgroundColor={theme.colors.surface}
        />
      }
    >
      <View style={styles.rangeRow}>
        <View style={styles.flex}>
          <SegmentedControl
            options={RANGE_OPTIONS}
            value={range}
            onChange={setRange}
            accessibilityLabel="Time range"
          />
        </View>
        <IconButton
          icon="ellipsis-horizontal"
          onPress={() => setMenu(true)}
          variant="outline"
          size="large"
          accessibilityLabel="More options"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        accessibilityRole="radiogroup"
        accessibilityLabel="Metric"
      >
        {METRIC_ORDER.map((m) => (
          <Chip
            key={m}
            label={METRICS[m].label}
            dotColor={theme.colors.chart[METRICS[m].colorKey]}
            selected={m === metric}
            onPress={() => setMetric(m)}
          />
        ))}
      </ScrollView>

      {noDevice ? (
        <Card>
          <EmptyState
            icon="leaf-outline"
            title="No greenhouse yet"
            message="History appears once the greenhouse sends data."
          />
        </Card>
      ) : failed ? (
        <Card>
          <ErrorState
            title={errorTitle(history.error)}
            message={describeError(history.error)}
            onRetry={() => void refresh()}
            retrying={refreshing}
          />
        </Card>
      ) : loading || !history.data ? (
        <View accessible accessibilityLabel="Loading history" style={styles.loading}>
          <Skeleton height={260} radius={18} />
          <View style={styles.row}>
            <Skeleton height={76} radius={16} width="48%" />
            <Skeleton height={76} radius={16} width="48%" />
          </View>
        </View>
      ) : empty ? (
        <Card>
          <EmptyState
            icon="analytics-outline"
            title="No data for this range yet"
            message={`No ${meta.label.toLowerCase()} readings in the ${RANGE_SPOKEN[range]}.`}
          />
        </Card>
      ) : (
        <>
          <HistoryOverview
            metric={metric}
            range={range}
            history={history.data}
            current={current}
            stale={history.isPlaceholderData}
          />
          {stats ? (
            <View style={styles.grid}>
              <View style={styles.row}>
                <StatTile label="Minimum" value={fmt(stats.min)} />
                <StatTile label="Maximum" value={fmt(stats.max)} />
              </View>
              <View style={styles.row}>
                <StatTile label="Average" value={fmt(stats.avg)} />
                <StatTile
                  label="Fan was on"
                  value={activity.data ? formatDuration(activity.data.totalOnSec) : '—'}
                />
              </View>
            </View>
          ) : null}
        </>
      )}

      {!noDevice ? (
        <>
          <FanActivityCard range={range} data={activity.data} loading={activity.isPending} />
          <HeatmapCard metric={metric} data={heatmap.data} loading={heatmap.isPending} />
        </>
      ) : null}

      <BottomSheet visible={menu} onClose={() => setMenu(false)} eyebrow="History" title="Options">
        <ListRow
          title="Refresh"
          subtitle="Load the latest data from the server"
          icon="refresh"
          onPress={() => {
            setMenu(false);
            void refresh();
          }}
        />
        <ListRow
          title="Share summary"
          subtitle={`${meta.label}, ${RANGE_SPOKEN[range]}: min, max, average`}
          icon="share-social-outline"
          onPress={() => void share()}
        />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  chips: { gap: 8 },
  loading: { gap: 12 },
  grid: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
});
