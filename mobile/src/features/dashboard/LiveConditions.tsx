import { router } from 'expo-router';
import { memo, useCallback, useMemo, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { SensorCard } from '@/components/greenhouse';
import { SectionHeader } from '@/components/ui';
import { useLiveStore } from '@/store/liveStore';
import { selectRecent, useRecentStore } from '@/store/recentStore';
import type { AlertMetric, Thresholds } from '@/types/api';
import { trendOf } from '@/utils/chart';
import { MANILA_TZ } from '@/utils/manilaTime';
import { limitsFor, sensorStatus } from '@/utils/sensors';

import { useLiveness } from './useLiveness';

const ORDER: AlertMetric[] = ['airTemp', 'humidity', 'soilMoisture', 'lux'];
/** Sparkline window. */
const SPARK_MS = 2 * 60_000;
/** Change over the sparkline window that counts as a trend (per metric). */
const TREND_EPSILON: Record<AlertMetric, number> = {
  airTemp: 0.2,
  humidity: 1,
  soilMoisture: 1,
  lux: 50,
};
/** Below this width (or with big fonts) the grid uses one column. */
const ONE_COLUMN_BELOW = 360;

/** "LIVE CONDITIONS / Right now · Asia/Manila" + 2×2 sensor cards. */
export function LiveConditions({
  deviceId,
  thresholds,
}: {
  deviceId: string;
  thresholds: Thresholds | undefined;
}) {
  const { width, fontScale } = useWindowDimensions();
  const columns = width < ONE_COLUMN_BELOW || fontScale > 1.3 ? 1 : 2;
  const open = useCallback((metric: AlertMetric) => {
    router.push({ pathname: '/sensor/[metric]', params: { metric } });
  }, []);

  return (
    <View style={styles.section}>
      <SectionHeader eyebrow="Live conditions" title="Right now" right={MANILA_TZ} />
      <Grid columns={columns}>
        {ORDER.map((metric) => {
          const [min, max] = thresholds ? limitsFor(metric, thresholds) : [null, null];
          return (
            <HomeSensorCard
              key={metric}
              deviceId={deviceId}
              metric={metric}
              min={min}
              max={max}
              onOpen={open}
            />
          );
        })}
      </Grid>
    </View>
  );
}

/**
 * One card bound to the stores. Selectors return primitives or stable arrays, so
 * a card re-renders only when its own data changes — never on the 1-second
 * "Updated 2 s ago" tick (that text owns its own timer).
 */
const HomeSensorCard = memo(function HomeSensorCard({
  deviceId,
  metric,
  min,
  max,
  onOpen,
}: {
  deviceId: string;
  metric: AlertMetric;
  min: number | null;
  max: number | null;
  onOpen: (metric: AlertMetric) => void;
}) {
  const value = useLiveStore((s) => s.readings[deviceId]?.[metric] ?? null);
  const liveness = useLiveness(deviceId);
  const points = useRecentStore((s) => selectRecent(s, deviceId));

  const { sparkline, trend } = useMemo(() => {
    const last = points[points.length - 1];
    if (!last) return { sparkline: [] as (number | null)[], trend: null };
    const since = last.t - SPARK_MS;
    const series = points.filter((p) => p.t >= since).map((p) => p[metric]);
    return { sparkline: series, trend: trendOf(series, TREND_EPSILON[metric]) };
  }, [points, metric]);

  const status = useMemo(
    () => sensorStatus(metric, value, min, max, liveness),
    [metric, value, min, max, liveness],
  );
  const press = useCallback(() => onOpen(metric), [onOpen, metric]);

  return (
    <SensorCard
      metric={metric}
      value={value}
      status={status}
      trend={liveness === 'live' ? trend : null}
      sparkline={sparkline}
      onPress={press}
    />
  );
});

function Grid({ columns, children }: { columns: number; children: ReactNode[] }) {
  const rows: ReactNode[][] = [];
  for (let i = 0; i < children.length; i += columns) rows.push(children.slice(i, i + columns));
  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.gridRow}>
          {row}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
});
