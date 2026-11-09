import { memo, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AreaLineChart, Card, Chip, StatusPill, Text, type ChartPoint } from '@/components/ui';
import { useLiveStore } from '@/store/liveStore';
import { RECENT_WINDOW_MS, selectRecent, useRecentStore } from '@/store/recentStore';
import { useTheme } from '@/theme';
import type { AlertMetric } from '@/types/api';
import { manilaTime } from '@/utils/manilaTime';
import { formatAxis, formatMetricText, formatValue, METRICS } from '@/utils/sensors';
import { useNow } from '@/utils/time';

import { useIsLive } from './useLiveness';

const METRICS_ORDER: AlertMetric[] = ['airTemp', 'humidity', 'soilMoisture', 'lux'];

/**
 * "LIVE TREND / Last 30 minutes": real readings from the live buffer; new
 * telemetry appends a point (the end dot pulses). Temperature shows the fan ON
 * threshold as a dashed line.
 */
export const LiveTrend = memo(function LiveTrend({
  deviceId,
  fanOnTemp,
}: {
  deviceId: string;
  fanOnTemp: number;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const [metric, setMetric] = useState<AlertMetric>('airTemp');
  const points = useRecentStore((s) => selectRecent(s, deviceId));
  const live = useIsLive(deviceId);
  const intervalSec = useLiveStore((s) => s.devices[deviceId]?.telemetryIntervalSec ?? 5);
  // The window slides with the clock even when no data arrives (device offline).
  const now = useNow(15_000);

  const chartPoints = useMemo<ChartPoint[]>(
    () => points.map((p) => ({ t: p.t, v: p[metric] })),
    [points, metric],
  );
  const domain = useMemo(() => [now - RECENT_WINDOW_MS, now] as const, [now]);
  const hasData = chartPoints.some((p) => p.v !== null);
  // Stable object: a new one every render would defeat the chart's memo and re-compute its geometry.
  const airTempColor = colors.chart.airTemp;
  const threshold = useMemo(
    () => (metric === 'airTemp' ? { value: fanOnTemp, color: airTempColor } : null),
    [metric, fanOnTemp, airTempColor],
  );
  const color = colors.chart[METRICS[metric].colorKey];
  const latest = [...chartPoints].reverse().find((p) => p.v !== null);
  const summary = hasData
    ? `${METRICS[metric].label}, last 30 minutes. Latest ${formatMetricText(metric, latest?.v ?? null)}.`
    : `${METRICS[metric].label}: no data in the last 30 minutes.`;

  return (
    <Card
      eyebrow="Live trend"
      title="Last 30 minutes"
      meta={
        <StatusPill
          tone={live ? 'ok' : 'offline'}
          label={live ? 'Live' : 'Paused'}
          variant="plain"
          uppercase
        />
      }
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        accessibilityRole="radiogroup"
        accessibilityLabel="Metric"
      >
        {METRICS_ORDER.map((m) => (
          <Chip
            key={m}
            label={METRICS[m].short}
            dotColor={colors.chart[METRICS[m].colorKey]}
            selected={m === metric}
            onPress={() => setMetric(m)}
            accessibilityLabel={METRICS[m].label}
          />
        ))}
      </ScrollView>

      {hasData ? (
        <AreaLineChart
          points={chartPoints}
          color={color}
          domain={domain}
          gapMs={3 * intervalSec * 1000 + 5000}
          height={150}
          floorZero={metric !== 'airTemp'}
          threshold={threshold}
          formatTick={(v) => formatAxis(metric, v)}
          formatValue={(v) => formatMetricText(metric, v)}
          formatTime={(t) => manilaTime(t)}
          xLabels={['30m ago', '15m', 'Now']}
          accessibilityLabel={summary}
        />
      ) : (
        <View style={[styles.empty, { backgroundColor: colors.surfaceMuted }]}>
          <Text variant="caption" color="secondary">
            No readings in the last 30 minutes
          </Text>
        </View>
      )}

      {metric === 'airTemp' ? (
        <View style={styles.legend} importantForAccessibility="no-hide-descendants">
          <View style={[styles.dash, { borderColor: colors.chart.airTemp }]} />
          <Text variant="micro" color="secondary">
            Fan ON threshold · {formatValue(fanOnTemp, fanOnTemp % 1 ? 1 : 0)}°C
          </Text>
        </View>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  chips: { gap: 8, paddingBottom: 12 },
  empty: { height: 150, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  dash: { width: 16, borderTopWidth: 1.5, borderStyle: 'dashed' },
});
