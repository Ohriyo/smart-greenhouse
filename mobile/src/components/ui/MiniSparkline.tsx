import { memo, useId, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { areaPath, smoothPath, type Pt } from '@/utils/chart';
import { useLayoutWidth } from '@/utils/useLayoutWidth';

interface MiniSparklineProps {
  /** Oldest → newest; null = gap. */
  values: readonly (number | null)[];
  color: string;
  height?: number;
}

/** Tiny area line with no axes, full width (bottom of sensor cards). Decorative. */
export const MiniSparkline = memo(function MiniSparkline({
  values,
  color,
  height = 34,
}: MiniSparklineProps) {
  const [width, onLayout] = useLayoutWidth();
  const gradientId = useId().replace(/:/g, '');

  const paths = useMemo(() => {
    const nums = values.filter((v): v is number => v !== null);
    if (width === 0 || nums.length < 2) return null;
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    const span = hi - lo || 1;
    const top = 4;
    const usable = height - top - 2;
    const step = width / Math.max(1, values.length - 1);
    const pts: (Pt | null)[] = values.map((v, i) =>
      v === null ? null : { x: i * step, y: top + (1 - (v - lo) / span) * usable },
    );
    return { line: smoothPath(pts), area: areaPath(pts, height) };
  }, [values, width, height]);

  return (
    <View onLayout={onLayout} style={{ height }} importantForAccessibility="no-hide-descendants">
      {paths ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.22} />
              <Stop offset="1" stopColor={color} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          <Path d={paths.area} fill={`url(#${gradientId})`} />
          <Path d={paths.line} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
        </Svg>
      ) : null}
    </View>
  );
});
