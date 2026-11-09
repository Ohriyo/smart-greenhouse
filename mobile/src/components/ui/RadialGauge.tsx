import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line, Path } from 'react-native-svg';

import { useTheme } from '@/theme';
import { useReducedMotion } from '@/utils/useReducedMotion';

import { Text } from './Text';

interface RadialGaugeProps {
  /** Current value (null = no reading: empty arc, "—"). */
  value: number | null;
  min: number;
  max: number;
  color: string;
  /** Big centered text ("43%", "31°"). */
  display: string;
  /** Under the value ("Optimal", "Comfortable"). */
  caption: string;
  /** At the arc ends ("Dry" / "Wet", "20°" / "40°"). */
  startLabel: string;
  endLabel: string;
  /** Softly tinted part of the track (the optimal zone). */
  zone?: readonly [number, number] | null;
  /** Small marks outside the arc (e.g. fan OFF/ON thresholds). */
  ticks?: readonly number[];
  size?: number;
  accessibilityLabel: string;
}

const SWEEP = 240; // degrees, open at the bottom
const START = 150; // degrees from +x, clockwise (screen coordinates)
const STROKE = 12;

const AnimatedPath = Animated.createAnimatedComponent(Path);

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const a = polar(cx, cy, r, fromDeg);
  const b = polar(cx, cy, r, toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)}A${r},${r} 0 ${large} 1 ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
}

/** Arc gauge: track, optional zone tint, animated value arc, ticks, centered value + caption. */
export const RadialGauge = memo(function RadialGauge({
  value,
  min,
  max,
  color,
  display,
  caption,
  startLabel,
  endLabel,
  zone = null,
  ticks = [],
  size = 140,
  accessibilityLabel,
}: RadialGaugeProps) {
  const theme = useTheme();
  const { colors } = theme;
  const reducedMotion = useReducedMotion();
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - STROKE / 2 - 6;
  const length = (SWEEP / 360) * 2 * Math.PI * r;
  const frac = (v: number) => Math.min(1, Math.max(0, (v - min) / (max - min || 1)));
  const deg = (v: number) => START + frac(v) * SWEEP;

  const progress = useSharedValue(0);
  const target = value === null ? 0 : frac(value);
  useEffect(() => {
    progress.set(
      reducedMotion
        ? target
        : withTiming(target, { duration: 700, easing: Easing.out(Easing.cubic) }),
    );
  }, [progress, target, reducedMotion]);

  const valueProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.value) }));

  // The SVG is cut just under the arc ends so the labels sit close.
  const svgH = cy + r * Math.sin((30 * Math.PI) / 180) + STROKE;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.wrap, { width: size }]}
    >
      <Svg width={size} height={svgH}>
        <Path
          d={arc(cx, cy, r, START, START + SWEEP)}
          stroke={colors.surfaceMuted}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
        />
        {zone ? (
          <Path
            d={arc(cx, cy, r, deg(zone[0]), deg(zone[1]))}
            stroke={color}
            strokeOpacity={0.14}
            strokeWidth={STROKE}
            fill="none"
          />
        ) : null}
        <AnimatedPath
          d={arc(cx, cy, r, START, START + SWEEP)}
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${length} ${length}`}
          animatedProps={valueProps}
        />
        {ticks.map((t) => {
          const a = polar(cx, cy, r + STROKE / 2 + 2, deg(t));
          const b = polar(cx, cy, r + STROKE / 2 + 8, deg(t));
          return (
            <Line
              key={t}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={colors.text}
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })}
      </Svg>
      <View
        style={[styles.center, { top: cy - 22 }]}
        importantForAccessibility="no-hide-descendants"
      >
        <Text variant="value" tabular style={styles.value}>
          {display}
        </Text>
        <Text variant="micro" color="secondary">
          {caption}
        </Text>
      </View>
      <View style={styles.ends} importantForAccessibility="no-hide-descendants">
        <Text variant="micro" color="tertiary">
          {startLabel}
        </Text>
        <Text variant="micro" color="tertiary">
          {endLabel}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  value: { fontSize: 26, lineHeight: 32 },
  ends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: -6,
  },
});
