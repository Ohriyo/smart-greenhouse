import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MiniBarChart } from '@/components/greenhouse';
import {
  Card,
  ErrorState,
  Screen,
  SegmentedControl,
  Skeleton,
  Text,
  type SegmentOption,
} from '@/components/ui';
import { mockHistory, mockThresholds } from '@/constants/mock';
import { useMockStore } from '@/store/mockStore';
import {
  AlertMetricSchema,
  type AlertMetric,
  type HistoryPoint,
  type HistoryRange,
} from '@/types/api';
import { formatRange, formatValue, limitsFor, METRICS } from '@/utils/sensors';
import { formatClock, formatDateTime } from '@/utils/time';

const METRIC_OPTIONS: readonly SegmentOption<AlertMetric>[] = [
  { value: 'airTemp', label: 'Temp', accessibilityLabel: 'Air temperature' },
  { value: 'humidity', label: 'Humidity' },
  { value: 'soilMoisture', label: 'Soil', accessibilityLabel: 'Soil moisture' },
  { value: 'lux', label: 'Light' },
];

const RANGE_OPTIONS: readonly SegmentOption<HistoryRange>[] = [
  { value: '24h', label: '24 h', accessibilityLabel: 'Last 24 hours' },
  { value: '7d', label: '7 days', accessibilityLabel: 'Last 7 days' },
  { value: '30d', label: '30 days', accessibilityLabel: 'Last 30 days' },
];

const RANGE_SPOKEN: Record<HistoryRange, string> = {
  '24h': 'last 24 hours',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
};

function summarize(points: HistoryPoint[]) {
  if (points.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const p of points) {
    min = Math.min(min, p.min);
    max = Math.max(max, p.max);
    sum += p.avg;
  }
  return { min, max, avg: sum / points.length };
}

export default function HistoryScreen() {
  // Opened from a dashboard card with ?metric=..., validated like any external input.
  const params = useLocalSearchParams<{ metric?: string }>();
  const paramMetric = AlertMetricSchema.safeParse(params.metric);
  const [metric, setMetric] = useState<AlertMetric>(
    paramMetric.success ? paramMetric.data : 'airTemp',
  );
  const [range, setRange] = useState<HistoryRange>('24h');
  const scenario = useMockStore((s) => s.scenario);

  // When a dashboard card opens this (already mounted) tab with a new ?metric=,
  // switch to it. Adjusting state during render is React's recommended
  // alternative to a setState-in-effect.
  const [seenParam, setSeenParam] = useState(params.metric);
  if (params.metric !== seenParam) {
    setSeenParam(params.metric);
    if (paramMetric.success) setMetric(paramMetric.data);
  }

  const meta = METRICS[metric];
  const [min, max] = limitsFor(metric, mockThresholds);
  const points = useMemo(() => mockHistory(metric, range), [metric, range]);
  const stats = summarize(points);
  const first = points[0];
  const last = points.at(-1);
  const fmt = (v: number) => `${formatValue(v, meta.decimals)} ${meta.unit}`;
  const target = formatRange(min, max, meta.unit);

  return (
    <Screen title="History" subtitle={`${meta.label} · ${RANGE_SPOKEN[range]}`}>
      <SegmentedControl
        options={METRIC_OPTIONS}
        value={metric}
        onChange={setMetric}
        accessibilityLabel="Metric"
      />
      <SegmentedControl
        options={RANGE_OPTIONS}
        value={range}
        onChange={setRange}
        accessibilityLabel="Time range"
      />

      {scenario === 'loading' ? (
        <Card style={styles.gap}>
          <View accessible accessibilityLabel="Loading history" style={styles.gap}>
            <Skeleton width="40%" height={14} />
            <Skeleton width="60%" height={36} />
            <Skeleton height={120} />
          </View>
        </Card>
      ) : scenario === 'error' ? (
        <ErrorState message="History couldn't be loaded from the backend." />
      ) : stats && first && last ? (
        <>
          <Card style={styles.gap}>
            <View>
              <Text variant="caption" color="secondary">
                Average
              </Text>
              <Text variant="display" tabular>
                {formatValue(stats.avg, meta.decimals)}
                <Text variant="heading" color="secondary">
                  {' '}
                  {meta.unit}
                </Text>
              </Text>
            </View>
            <MiniBarChart
              points={points}
              min={min}
              max={max}
              accessibilityLabel={`${meta.label}, ${RANGE_SPOKEN[range]}, from ${fmt(stats.min)} to ${fmt(stats.max)}`}
            />
            <View style={styles.axis} importantForAccessibility="no-hide-descendants">
              <Text variant="caption" color="tertiary">
                {range === '24h' ? formatClock(first.ts) : formatDateTime(first.ts)}
              </Text>
              <Text variant="caption" color="tertiary">
                Now
              </Text>
            </View>
          </Card>

          <View style={styles.statsRow}>
            <Stat label="Lowest" value={fmt(stats.min)} />
            <Stat label="Highest" value={fmt(stats.max)} />
          </View>
          <Card>
            <Text variant="caption" color="secondary">
              Target range
            </Text>
            <Text variant="bodyStrong">{target ?? 'No limits set'}</Text>
            <Text variant="caption" color="tertiary" style={styles.note}>
              Bars outside the target are amber. The interactive chart arrives with live data.
            </Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.stat} accessibilityLabel={`${label}: ${value}`}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <Text variant="heading" tabular>
        {value}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 12 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  statsRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, gap: 2 },
  note: { marginTop: 6 },
});
