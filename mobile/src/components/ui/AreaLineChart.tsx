import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';
import { areaPath, bandPath, niceScale, smoothPath, type Pt } from '@/utils/chart';
import { useLayoutWidth } from '@/utils/useLayoutWidth';
import { useReducedMotion } from '@/utils/useReducedMotion';

import { Text } from './Text';

export interface ChartPoint {
  /** Epoch ms. */
  t: number;
  /** Line value (average); null = no data. */
  v: number | null;
  /** Optional range for the min–max band. */
  min?: number;
  max?: number;
}

interface AreaLineChartProps {
  points: readonly ChartPoint[];
  color: string;
  /** Visible time window [from, to] in epoch ms. */
  domain: readonly [number, number];
  /** Consecutive points further apart than this are a gap (line break). */
  gapMs: number;
  height?: number;
  /** Axis label for a value: "30°", "60%". */
  formatTick: (value: number) => string;
  /** Tooltip value + time. */
  formatValue: (value: number) => string;
  formatTime: (t: number) => string;
  /** Labels spread evenly under the chart ("30m ago", "15m", "Now"). */
  xLabels: readonly string[];
  /** Dashed horizontal line (e.g. fan ON threshold). */
  threshold?: { value: number; color: string } | null;
  /** Vertical dashed line + ring at a moment (e.g. when an alert fired). */
  marker?: { t: number; color: string } | null;
  /** Pulsing dot on the newest point. Off for past windows (it would suggest "now"). */
  endDot?: boolean;
  /** Draw a soft min–max band behind the line. */
  band?: boolean;
  /** Values can't go below 0 (%, lux). */
  floorZero?: boolean;
  /** Spoken summary (the chart itself is visual). */
  accessibilityLabel: string;
}

const LABEL_W = 34;
const PAD_TOP = 8;
const PAD_RIGHT = 8;
const DOT = 5;
const TOOLTIP_W = 132;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Area line chart in react-native-svg: gradient fill, smooth (monotone) line that
 * breaks at data gaps, dashed grid with 3 y ticks, end dot with a soft pulse,
 * optional dashed threshold and min–max band. Touch or drag for a tooltip.
 */
export const AreaLineChart = memo(function AreaLineChart({
  points,
  color,
  domain,
  gapMs,
  height = 150,
  formatTick,
  formatValue,
  formatTime,
  xLabels,
  threshold = null,
  marker = null,
  endDot = true,
  band = false,
  floorZero = false,
  accessibilityLabel,
}: AreaLineChartProps) {
  const theme = useTheme();
  const { colors } = theme;
  const [width, onLayout] = useLayoutWidth();
  const gradientId = useId().replace(/:/g, '');
  const [active, setActive] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [from, to] = domain;
  const plotW = Math.max(1, width - LABEL_W - PAD_RIGHT);
  const plotH = height - PAD_TOP;

  const geo = useMemo(() => {
    const values: number[] = [];
    for (const p of points) {
      if (p.v !== null) values.push(p.v);
      if (band && p.min !== undefined) values.push(p.min);
      if (band && p.max !== undefined) values.push(p.max);
    }
    const scale = niceScale(values, {
      sections: 2,
      include: threshold ? [threshold.value] : [],
      floorZero,
    });
    const x = (t: number) => LABEL_W + ((t - from) / Math.max(1, to - from)) * plotW;
    const y = (v: number) => PAD_TOP + (1 - (v - scale.min) / (scale.max - scale.min || 1)) * plotH;

    const line: (Pt | null)[] = [];
    const upper: (Pt | null)[] = [];
    const lower: (Pt | null)[] = [];
    let prevT: number | null = null;
    for (const p of points) {
      if (prevT !== null && p.t - prevT > gapMs) {
        line.push(null);
        upper.push(null);
        lower.push(null);
      }
      prevT = p.t;
      const px = x(p.t);
      line.push(p.v === null ? null : { x: px, y: y(p.v) });
      upper.push(p.max === undefined ? null : { x: px, y: y(p.max) });
      lower.push(p.min === undefined ? null : { x: px, y: y(p.min) });
    }
    let last: Pt | null = null;
    for (let i = line.length - 1; i >= 0 && !last; i--) last = line[i] ?? null;
    // The curve point closest in time to the marker (where its ring sits).
    let markerPt: Pt | null = null;
    if (marker) {
      let bestD = Infinity;
      for (const p of points) {
        if (p.v === null) continue;
        const d = Math.abs(p.t - marker.t);
        if (d < bestD) {
          bestD = d;
          markerPt = { x: x(marker.t), y: y(p.v) };
        }
      }
    }
    return {
      markerPt,
      scale,
      y,
      line: smoothPath(line),
      area: areaPath(line, height),
      band: band ? bandPath(upper, lower) : '',
      last,
    };
  }, [points, band, threshold, marker, floorZero, from, to, plotW, plotH, gapMs, height]);

  // Soft pulse ring around the newest point.
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    pulse.set(
      withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, [pulse, reducedMotion]);
  const ringProps = useAnimatedProps(() => ({
    r: DOT + pulse.value * 7,
    opacity: 0.35 * (1 - pulse.value),
  }));

  // ---------- Tooltip (touch / drag) ----------
  const nearest = (touchX: number) => {
    let best: number | null = null;
    let bestD = Infinity;
    const t = from + ((touchX - LABEL_W) / plotW) * (to - from);
    points.forEach((p, i) => {
      if (p.v === null) return;
      const d = Math.abs(p.t - t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  const show = (touchX: number) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setActive(nearest(touchX));
  };
  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(null), 2500);
  };
  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  const pan = usePanGesture({
    runOnJS: true,
    activeOffsetX: [-4, 4],
    failOffsetY: [-12, 12],
    onActivate: (e) => show(e.x),
    onUpdate: (e) => show(e.x),
    onDeactivate: () => scheduleHide(),
  });

  const activePoint = active !== null ? points[active] : undefined;
  const activeX =
    activePoint && width > 0
      ? LABEL_W + ((activePoint.t - from) / Math.max(1, to - from)) * plotW
      : 0;
  const tooltipLeft = Math.min(
    Math.max(0, activeX - TOOLTIP_W / 2),
    Math.max(0, width - TOOLTIP_W),
  );

  return (
    <View>
      <GestureDetector gesture={pan}>
        <Pressable
          onLayout={onLayout}
          onPress={(e) => {
            show(e.nativeEvent.locationX);
            scheduleHide();
          }}
          accessible
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
          style={{ height }}
        >
          {width > 0 ? (
            <Svg width={width} height={height}>
              <Defs>
                <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                  <Stop offset="1" stopColor={color} stopOpacity={0.03} />
                </LinearGradient>
              </Defs>
              {geo.scale.ticks.map((tick) => (
                <Line
                  key={tick}
                  x1={LABEL_W}
                  x2={width - PAD_RIGHT}
                  y1={geo.y(tick)}
                  y2={geo.y(tick)}
                  stroke={colors.chart.grid}
                  strokeWidth={1}
                  strokeDasharray="4 5"
                />
              ))}
              {geo.band ? <Path d={geo.band} fill={color} fillOpacity={0.12} /> : null}
              <Path d={geo.area} fill={`url(#${gradientId})`} />
              {threshold ? (
                <Line
                  x1={LABEL_W}
                  x2={width - PAD_RIGHT}
                  y1={geo.y(threshold.value)}
                  y2={geo.y(threshold.value)}
                  stroke={threshold.color}
                  strokeWidth={1.25}
                  strokeDasharray="5 4"
                />
              ) : null}
              <Path
                d={geo.line}
                stroke={color}
                strokeWidth={2.25}
                fill="none"
                strokeLinecap="round"
              />
              {activePoint && activePoint.v !== null ? (
                <>
                  <Line
                    x1={activeX}
                    x2={activeX}
                    y1={PAD_TOP}
                    y2={height}
                    stroke={colors.textTertiary}
                    strokeWidth={1}
                  />
                  <Circle
                    cx={activeX}
                    cy={geo.y(activePoint.v)}
                    r={4}
                    fill={color}
                    stroke={colors.surface}
                    strokeWidth={2}
                  />
                </>
              ) : null}
              {marker && geo.markerPt ? (
                <>
                  <Line
                    x1={geo.markerPt.x}
                    x2={geo.markerPt.x}
                    y1={PAD_TOP}
                    y2={height}
                    stroke={marker.color}
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                  <Circle
                    cx={geo.markerPt.x}
                    cy={geo.markerPt.y}
                    r={6}
                    fill={colors.surface}
                    stroke={marker.color}
                    strokeWidth={2.5}
                  />
                </>
              ) : null}
              {endDot && geo.last ? (
                <>
                  <AnimatedCircle
                    cx={geo.last.x}
                    cy={geo.last.y}
                    fill={color}
                    animatedProps={ringProps}
                  />
                  <Circle
                    cx={geo.last.x}
                    cy={geo.last.y}
                    r={DOT}
                    fill={color}
                    stroke={colors.surface}
                    strokeWidth={2}
                  />
                </>
              ) : null}
            </Svg>
          ) : null}
          {width > 0
            ? geo.scale.ticks.map((tick, i) =>
                // Top, middle and bottom tick labels only.
                i % Math.max(1, Math.floor(geo.scale.ticks.length / 3)) === 0 ? (
                  <Text
                    key={tick}
                    variant="micro"
                    color="tertiary"
                    style={[styles.yLabel, { top: geo.y(tick) - 7 }]}
                    importantForAccessibility="no"
                  >
                    {formatTick(tick)}
                  </Text>
                ) : null,
              )
            : null}
        </Pressable>
      </GestureDetector>
      <View
        style={[styles.xLabels, { marginLeft: LABEL_W, marginRight: PAD_RIGHT }]}
        importantForAccessibility="no-hide-descendants"
      >
        {xLabels.map((label, i) => (
          <Text key={`${label}-${i}`} variant="micro" color="tertiary">
            {label}
          </Text>
        ))}
      </View>
      {activePoint && activePoint.v !== null ? (
        <View
          pointerEvents="none"
          style={[
            styles.tooltip,
            {
              left: tooltipLeft,
              backgroundColor: colors.inverse,
              boxShadow: `0px 2px 8px ${colors.shadow}`,
            },
          ]}
          accessibilityLiveRegion="polite"
        >
          <Text variant="bodyStrong" tint={colors.onInverse}>
            {formatValue(activePoint.v)}
          </Text>
          <Text variant="micro" tint={colors.onInverse}>
            {formatTime(activePoint.t)}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  yLabel: { position: 'absolute', left: 0, width: LABEL_W - 4 },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  tooltip: {
    position: 'absolute',
    top: -6,
    width: TOOLTIP_W,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
  },
});
