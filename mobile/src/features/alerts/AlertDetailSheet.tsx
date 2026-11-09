import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AreaLineChart,
  BottomSheet,
  Button,
  IconTile,
  Skeleton,
  StatTile,
  StatusPill,
  Text,
  type ChartPoint,
} from '@/components/ui';
import { useHistory } from '@/features/history/useHistory';
import { toneColors, useTheme } from '@/theme';
import type { Alert, HistoryRange } from '@/types/api';
import {
  manilaDateTime,
  manilaDate,
  manilaTime,
  manilaWeekday,
  MANILA_TZ,
} from '@/utils/manilaTime';
import { formatAxis, formatMetricText, METRICS } from '@/utils/sensors';
import { formatRelative } from '@/utils/time';

import { alertDetail, alertTitle, alertVisual, SEVERITY_LABEL } from './presentation';

const HOUR = 3_600_000;

/**
 * Which history range shows an alert's moment, and how much time to show on each
 * side of it. Smallest range that still contains the moment (history keeps 30 days).
 */
export function contextWindow(
  alertTs: number,
  now: number,
): { range: HistoryRange; half: number } | null {
  const age = now - alertTs;
  if (age < 0 || age > 30 * 24 * HOUR) return null;
  if (age <= 20 * HOUR) return { range: '24h', half: 3 * HOUR };
  if (age <= 6.5 * 24 * HOUR) return { range: '7d', half: 12 * HOUR };
  return { range: '30d', half: 48 * HOUR };
}

function axisLabel(range: HistoryRange, t: number): string {
  if (range === '24h') return manilaTime(t);
  if (range === '7d') return `${manilaWeekday(t)} ${manilaTime(t)}`;
  return manilaDate(t);
}

interface AlertDetailSheetProps {
  /** Kept after closing so the sheet doesn't go blank during its closing animation. */
  alert: Alert | null;
  visible: boolean;
  onClose: () => void;
}

/** Severity, message, reading vs limit, time, and a chart of the metric around the event. */
export function AlertDetailSheet({ alert, visible, onClose }: AlertDetailSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      eyebrow={alert ? `${SEVERITY_LABEL[alert.severity]} alert` : 'Alert'}
      title={alert ? alertTitle(alert) : ''}
    >
      {alert ? <Body alert={alert} onClose={onClose} /> : null}
    </BottomSheet>
  );
}

function Body({ alert, onClose }: { alert: Alert; onClose: () => void }) {
  const theme = useTheme();
  const { colors } = theme;
  const metric = alert.metric;
  const alertTs = Date.parse(alert.ts);
  const visual = alertVisual(alert);
  const tone = toneColors(theme, visual.tone);
  // Computed once when the sheet opens: the window must not move while you read it.
  const [now] = useState(() => Date.now());
  const win = useMemo(() => (metric ? contextWindow(alertTs, now) : null), [metric, alertTs, now]);

  // No metric (offline/online) or too old: the query stays disabled (no device id).
  const history = useHistory(
    win ? alert.deviceId : undefined,
    metric ?? 'airTemp',
    win?.range ?? '24h',
  );

  const view = useMemo(() => {
    if (!win || !history.data) return null;
    const from = alertTs - win.half;
    const to = Math.min(alertTs + win.half, now);
    const points: ChartPoint[] = history.data.points
      .map((p) => ({ t: Date.parse(p.ts), v: p.avg, min: p.min, max: p.max }))
      .filter((p) => p.t >= from && p.t <= to);
    return { from, to, domain: [from, to] as const, points, gapMs: history.data.bucketMs * 1.5 };
  }, [win, history.data, alertTs, now]);

  const meta = metric ? METRICS[metric] : null;
  const color = metric ? colors.chart[METRICS[metric].colorKey] : colors.accent;
  const isBreach = alert.type === 'above_max' || alert.type === 'below_min';
  const limit = alert.limit ?? null;
  // Stable object: a new one every render would defeat the chart's memo and re-compute its geometry.
  const toneColor = tone.fg;
  const limitLine = useMemo(
    () => (isBreach && limit !== null ? { value: limit, color: toneColor } : null),
    [isBreach, limit, toneColor],
  );
  const marker = useMemo(() => ({ t: alertTs, color: toneColor }), [alertTs, toneColor]);

  return (
    <View style={styles.body}>
      <View style={styles.head}>
        <IconTile icon={visual.icon} tone={visual.tone} size={44} />
        <View style={styles.headText}>
          <View style={styles.pills}>
            <StatusPill tone={visual.tone} label={SEVERITY_LABEL[alert.severity]} />
            {alert.readAt === null ? null : (
              <StatusPill tone="neutral" label="Read" variant="outline" />
            )}
          </View>
          <Text
            variant="caption"
            color="secondary"
            accessibilityLabel={`${manilaDateTime(alert.ts)}, Asia Manila time`}
          >
            {manilaDateTime(alert.ts)} · {MANILA_TZ} · {formatRelative(alert.ts, now)}
          </Text>
        </View>
      </View>

      <Text>{alert.message}</Text>

      {metric && alert.value !== null ? (
        <View style={styles.tiles}>
          <StatTile label="Reading" value={formatMetricText(metric, alert.value)} />
          {isBreach && limit !== null ? (
            <StatTile
              label={alert.type === 'above_max' ? 'Upper limit' : 'Lower limit'}
              value={formatMetricText(metric, limit)}
            />
          ) : null}
        </View>
      ) : null}

      {metric && meta ? (
        <View style={styles.chartBlock}>
          <Text variant="eyebrow" color="secondary">
            {meta.label} around this alert
          </Text>
          {!win ? (
            <Text variant="caption" color="secondary">
              Readings from this time are no longer kept (history is stored for 30 days).
            </Text>
          ) : history.isPending ? (
            <Skeleton height={170} radius={12} />
          ) : history.isError ? (
            <Text variant="caption" color="secondary">
              The chart is unavailable right now.
            </Text>
          ) : view && view.points.length > 1 ? (
            <AreaLineChart
              points={view.points}
              color={color}
              domain={view.domain}
              gapMs={view.gapMs}
              band
              endDot={false}
              height={170}
              floorZero={metric !== 'airTemp'}
              threshold={limitLine}
              marker={marker}
              formatTick={(v) => formatAxis(metric, v)}
              formatValue={(v) => formatMetricText(metric, v)}
              formatTime={(t) => manilaDateTime(t)}
              xLabels={[
                axisLabel(win.range, view.from),
                axisLabel(win.range, (view.from + view.to) / 2),
                view.to >= now - 1000 ? 'Now' : axisLabel(win.range, view.to),
              ]}
              accessibilityLabel={`${meta.label} around the alert: ${alertDetail(alert)}`}
            />
          ) : (
            <Text variant="caption" color="secondary">
              No readings around this time.
            </Text>
          )}
          {view && view.points.length > 1 ? (
            <Text variant="micro" color="tertiary">
              Dashed vertical line: when the alert was raised
              {isBreach && limit !== null ? '. Dashed horizontal line: the limit.' : '.'}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        {metric ? (
          <Button
            label="Open in History"
            icon="mci-history"
            fullWidth
            onPress={() => {
              onClose();
              router.push({ pathname: '/history', params: { metric } });
            }}
          />
        ) : null}
        <Button label="Close" variant="secondary" fullWidth onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, gap: 6 },
  pills: { flexDirection: 'row', gap: 6 },
  tiles: { flexDirection: 'row', gap: 10 },
  chartBlock: { gap: 8 },
  actions: { gap: 10, marginTop: 4 },
});
