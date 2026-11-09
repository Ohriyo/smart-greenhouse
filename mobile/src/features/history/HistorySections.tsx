import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AreaLineChart,
  BarActivityChart,
  Card,
  HeatmapGrid,
  Skeleton,
  Text,
  type ChartPoint,
  type HeatmapRow,
} from '@/components/ui';
import { useTheme } from '@/theme';
import type { AlertMetric, FanActivity, Heatmap, History, HistoryRange } from '@/types/api';
import { manilaDateTime } from '@/utils/manilaTime';
import { formatAxis, formatMetric, formatMetricText, METRICS } from '@/utils/sensors';
import { formatDuration, formatDurationSpoken } from '@/utils/time';

import { RANGE_EYEBROW, RANGE_SPOKEN, rangeLabels } from './axis';

// ---------- Overview: average line + min–max band ----------

export const HistoryOverview = memo(function HistoryOverview({
  metric,
  range,
  history,
  current,
  stale,
}: {
  metric: AlertMetric;
  range: HistoryRange;
  history: History;
  /** Latest live value shown at the top right. */
  current: number | null;
  /** Previous range still shown while the new one loads. */
  stale: boolean;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const meta = METRICS[metric];
  const color = colors.chart[meta.colorKey];
  const now = formatMetric(metric, current);

  const from = Date.parse(history.from);
  const to = Date.parse(history.to);
  const points = useMemo<ChartPoint[]>(
    () => history.points.map((p) => ({ t: Date.parse(p.ts), v: p.avg, min: p.min, max: p.max })),
    [history.points],
  );
  const domain = useMemo(() => [from, to] as const, [from, to]);

  return (
    <Card style={stale ? styles.stale : null}>
      <Text variant="eyebrow" color="secondary">
        {RANGE_EYEBROW[range]}
      </Text>
      <View style={styles.titleRow}>
        <Text variant="sectionTitle" accessibilityRole="header" style={styles.flex}>
          {meta.label}
        </Text>
        <View style={styles.current} accessible accessibilityLabel={`Now ${now.spoken}`}>
          <Text variant="metric" tabular style={styles.currentValue}>
            {now.value}
          </Text>
          <Text variant="caption" color="secondary">
            {now.unit}
          </Text>
        </View>
      </View>
      <View style={styles.legend} importantForAccessibility="no-hide-descendants">
        <View style={[styles.legendLine, { backgroundColor: color }]} />
        <Text variant="micro" color="secondary">
          Average
        </Text>
        <View style={[styles.legendBand, { backgroundColor: color }]} />
        <Text variant="micro" color="secondary">
          Min–max range
        </Text>
      </View>
      <AreaLineChart
        points={points}
        color={color}
        domain={domain}
        gapMs={history.bucketMs * 1.5}
        band
        height={170}
        floorZero={metric !== 'airTemp'}
        formatTick={(v) => formatAxis(metric, v)}
        formatValue={(v) => formatMetricText(metric, v)}
        formatTime={(t) => manilaDateTime(t)}
        xLabels={rangeLabels(range, from, to)}
        accessibilityLabel={`${meta.label}, ${RANGE_SPOKEN[range]}: average line with the minimum to maximum range. Touch the chart for values.`}
      />
    </Card>
  );
});

// ---------- Fan activity ----------

export const FanActivityCard = memo(function FanActivityCard({
  range,
  data,
  loading,
}: {
  range: HistoryRange;
  data: FanActivity | undefined;
  loading: boolean;
}) {
  const buckets = useMemo(
    () =>
      data ? data.buckets.map((b) => ({ fraction: Math.min(1, b.onSec / data.bucketSec) })) : [],
    [data],
  );
  const total = data ? formatDuration(data.totalOnSec) : '—';
  return (
    <Card eyebrow="Automation" title="Fan activity" meta={data ? `${total} total` : undefined}>
      {data ? (
        <BarActivityChart
          buckets={buckets}
          xLabels={rangeLabels(range, Date.parse(data.from), Date.parse(data.to))}
          accessibilityLabel={`Fan ran ${formatDurationSpoken(data.totalOnSec)} in the ${RANGE_SPOKEN[range]}, in ${data.buckets.filter((b) => b.onSec > 0).length} of ${data.buckets.length} periods`}
        />
      ) : loading ? (
        <Skeleton height={80} />
      ) : (
        <Text variant="caption" color="secondary">
          Fan activity is unavailable right now.
        </Text>
      )}
    </Card>
  );
});

// ---------- Heatmap ----------

const COLUMN_LABELS = { 0: '12a', 6: '6a', 12: '12p', 18: '6p' } as const;

export const HeatmapCard = memo(function HeatmapCard({
  metric,
  data,
  loading,
}: {
  metric: AlertMetric;
  data: Heatmap | undefined;
  loading: boolean;
}) {
  const theme = useTheme();
  const meta = METRICS[metric];
  const rows = useMemo<HeatmapRow[]>(
    () => (data ? data.rows.map((r) => ({ label: r.weekday.slice(0, 1), values: r.hours })) : []),
    [data],
  );
  const summary = useMemo(() => {
    if (!data) return '';
    let hotValue = -Infinity;
    let hotHour = -1;
    for (const r of data.rows) {
      for (let h = 0; h < r.hours.length; h++) {
        const v = r.hours[h];
        if (v !== null && v !== undefined && v > hotValue) {
          hotValue = v;
          hotHour = h;
        }
      }
    }
    return hotHour >= 0
      ? `${meta.label} by hour over the last 7 days. Highest around ${hotHour}:00 at ${formatMetricText(metric, hotValue)}.`
      : `${meta.label} by hour: no data in the last 7 days.`;
  }, [data, meta.label, metric]);

  const title = metric === 'airTemp' ? 'Temperature by hour' : `${meta.short} by hour`;
  return (
    <Card eyebrow="Patterns" title={title} meta="Last 7 days">
      {data ? (
        <HeatmapGrid
          rows={rows}
          color={theme.colors.chart[meta.colorKey]}
          columnLabels={COLUMN_LABELS}
          accessibilityLabel={summary}
        />
      ) : loading ? (
        <Skeleton height={140} />
      ) : (
        <Text variant="caption" color="secondary">
          Patterns are unavailable right now.
        </Text>
      )}
    </Card>
  );
});

const styles = StyleSheet.create({
  stale: { opacity: 0.6 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  flex: { flex: 1 },
  current: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  currentValue: { fontSize: 28, lineHeight: 34 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 10 },
  legendLine: { width: 14, height: 2, borderRadius: 1 },
  legendBand: { width: 14, height: 8, borderRadius: 2, opacity: 0.2, marginLeft: 8 },
});
