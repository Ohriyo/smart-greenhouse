import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { UpdatedAgo } from '@/components/greenhouse';
import {
  AreaLineChart,
  Button,
  Card,
  Divider,
  Eyebrow,
  IconButton,
  IconTile,
  Screen,
  Skeleton,
  StatTile,
  StatusPill,
  Text,
  type ChartPoint,
} from '@/components/ui';
import { useLatestQuery, useRecentQuery, useThresholdsQuery } from '@/features/dashboard/queries';
import { useLiveness } from '@/features/dashboard/useLiveness';
import { useHistory } from '@/features/history/useHistory';
import { useLiveStore } from '@/store/liveStore';
import { RECENT_WINDOW_MS, selectRecent, useRecentStore } from '@/store/recentStore';
import { useTheme } from '@/theme';
import { AlertMetricSchema, type AlertMetric, type HistoryPoint } from '@/types/api';
import { manilaStartOfDay, manilaTime } from '@/utils/manilaTime';
import {
  formatAxis,
  formatMetric,
  formatMetricText,
  formatRange,
  limitsFor,
  METRICS,
  sensorStatus,
} from '@/utils/sensors';
import { useNow } from '@/utils/time';

/** Sensor Detail (opened from a Home card): live value + chart, today's stats, limits. */
export default function SensorDetailRoute() {
  const params = useLocalSearchParams<{ metric?: string }>();
  const parsed = AlertMetricSchema.safeParse(params.metric);
  if (!parsed.success) return <Redirect href="/" />;
  return <SensorDetail metric={parsed.data} />;
}

interface TodayStats {
  min: number;
  max: number;
  avg: number;
}

/** Today (since Manila midnight) from the 24 h buckets; the average is weighted by readings. */
function todayStats(points: readonly HistoryPoint[], now: number): TodayStats | null {
  const since = manilaStartOfDay(now);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (const p of points) {
    if (Date.parse(p.ts) < since) continue;
    min = Math.min(min, p.min);
    max = Math.max(max, p.max);
    sum += p.avg * p.count;
    count += p.count;
  }
  return count > 0 ? { min, max, avg: sum / count } : null;
}

function SensorDetail({ metric }: { metric: AlertMetric }) {
  const theme = useTheme();
  const { colors } = theme;
  const meta = METRICS[metric];
  const color = colors.chart[meta.colorKey];

  const deviceId = useLiveStore((s) => s.deviceIds[0]);
  useLatestQuery(deviceId);
  useRecentQuery(deviceId);
  const thresholds = useThresholdsQuery(deviceId).data;
  const history = useHistory(deviceId, metric, '24h');

  const value = useLiveStore((s) => (deviceId ? s.readings[deviceId]?.[metric] : null) ?? null);
  const liveness = useLiveness(deviceId);
  const intervalSec = useLiveStore(
    (s) => (deviceId ? s.devices[deviceId]?.telemetryIntervalSec : null) ?? 5,
  );
  const points = useRecentStore((s) => selectRecent(s, deviceId));
  const now = useNow(15_000);

  const [min, max] = thresholds ? limitsFor(metric, thresholds) : [null, null];
  const status = sensorStatus(metric, value, min, max, liveness);
  const shown = formatMetric(metric, value);
  const chartPoints = useMemo<ChartPoint[]>(
    () => points.map((p) => ({ t: p.t, v: p[metric] })),
    [points, metric],
  );
  const domain = useMemo(() => [now - RECENT_WINDOW_MS, now] as const, [now]);
  const hasChart = chartPoints.some((p) => p.v !== null);
  // Stable object: a new one every render would defeat the chart's memo and re-compute its geometry.
  const fanOnTemp = thresholds?.fanOnTemp ?? null;
  const airTempColor = colors.chart.airTemp;
  const fanLine = useMemo(
    () =>
      metric === 'airTemp' && fanOnTemp !== null ? { value: fanOnTemp, color: airTempColor } : null,
    [metric, fanOnTemp, airTempColor],
  );
  const today = useMemo(() => todayStats(history.data?.points ?? [], now), [history.data, now]);
  const fmt = (v: number) => formatMetricText(metric, v);
  const limits = formatRange(min, max, meta.unit);

  return (
    <Screen
      title={meta.label}
      header={
        <View style={styles.header}>
          <IconButton
            icon="arrow-back"
            onPress={() => router.back()}
            accessibilityLabel="Back"
            variant="outline"
          />
          <View style={styles.headerText}>
            <Eyebrow>Sensor</Eyebrow>
            <Text variant="title" accessibilityRole="header" numberOfLines={1}>
              {meta.label}
            </Text>
          </View>
        </View>
      }
    >
      <Card accessibilityLabel={`${meta.label}, ${shown.spoken}, ${status.label}`}>
        <View style={styles.valueTop}>
          <IconTile icon={meta.icon} color={color} background={`${color}1A`} size={44} />
          <StatusPill tone={status.tone} label={status.label} />
        </View>
        <View style={styles.valueRow}>
          <Text variant="display" tabular>
            {shown.value}
          </Text>
          <Text variant="body" color="secondary">
            {shown.unit}
          </Text>
        </View>
        {deviceId ? <UpdatedAgo deviceId={deviceId} prefix="Updated" color="secondary" /> : null}
      </Card>

      <Card
        eyebrow="Live"
        title="Last 30 minutes"
        meta={
          <StatusPill
            tone={liveness === 'live' ? 'ok' : 'offline'}
            label={liveness === 'live' ? 'Live' : 'Paused'}
            variant="plain"
            uppercase
          />
        }
      >
        {hasChart ? (
          <AreaLineChart
            points={chartPoints}
            color={color}
            domain={domain}
            gapMs={3 * intervalSec * 1000 + 5000}
            height={220}
            floorZero={metric !== 'airTemp'}
            threshold={fanLine}
            formatTick={(v) => formatAxis(metric, v)}
            formatValue={fmt}
            formatTime={(t) => manilaTime(t)}
            xLabels={['30m ago', '15m', 'Now']}
            accessibilityLabel={`${meta.label}, last 30 minutes, latest ${shown.spoken}`}
          />
        ) : (
          <View style={[styles.empty, { backgroundColor: colors.surfaceMuted }]}>
            <Text variant="caption" color="secondary">
              No readings in the last 30 minutes
            </Text>
          </View>
        )}
      </Card>

      <View style={styles.statsHeader}>
        <Eyebrow>Today · Asia/Manila</Eyebrow>
      </View>
      {history.isPending ? (
        <View style={styles.row} accessibilityLabel="Loading today's statistics">
          <Skeleton height={76} radius={16} width="31%" />
          <Skeleton height={76} radius={16} width="31%" />
          <Skeleton height={76} radius={16} width="31%" />
        </View>
      ) : today ? (
        <View style={styles.row}>
          <StatTile label="Minimum" value={fmt(today.min)} />
          <StatTile label="Maximum" value={fmt(today.max)} />
          <StatTile label="Average" value={fmt(today.avg)} />
        </View>
      ) : (
        <Text variant="caption" color="secondary">
          {history.isError
            ? 'Today’s statistics are unavailable right now.'
            : 'No readings yet today.'}
        </Text>
      )}

      <Card eyebrow="Alert rules" title="Current thresholds">
        <View style={styles.limitRow}>
          <Text color="secondary">Alert limits</Text>
          <Text variant="bodyStrong">{limits ?? 'No limits set'}</Text>
        </View>
        {metric === 'airTemp' && thresholds ? (
          <>
            <Divider style={styles.divider} />
            <View style={styles.limitRow}>
              <Text color="secondary">Fan turns ON / OFF</Text>
              <Text variant="bodyStrong">
                {thresholds.fanOnTemp}° / {thresholds.fanOffTemp}°
              </Text>
            </View>
          </>
        ) : null}
        <View style={styles.actions}>
          <Button
            label="Open in History"
            icon="mci-history"
            fullWidth
            onPress={() => router.push({ pathname: '/history', params: { metric } })}
          />
          <Button
            label="Edit thresholds"
            variant="secondary"
            fullWidth
            onPress={() => router.push('/control')}
          />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 2 },
  valueTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 12 },
  empty: { height: 220, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statsHeader: { marginBottom: -4 },
  row: { flexDirection: 'row', gap: 10 },
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    minHeight: 36,
  },
  divider: { marginVertical: 6 },
  actions: { gap: 10, marginTop: 14 },
});
