import { useEffect, useState } from 'react';
import { Animated, type DimensionValue } from 'react-native';

import { useTheme } from '@/theme';
import { useReducedMotion } from '@/utils/useReducedMotion';

interface SkeletonProps {
  width?: DimensionValue;
  height: number;
  radius?: number;
}

/**
 * Pulsing placeholder block (opacity only, on the native driver). Hidden from
 * TalkBack: wrap a group of skeletons in a View with accessibilityLabel="Loading".
 */
export function Skeleton({ width = '100%', height, radius }: SkeletonProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reducedMotion]);

  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width,
        height,
        borderRadius: radius ?? theme.radii.sm,
        backgroundColor: theme.colors.skeleton,
        opacity,
      }}
    />
  );
}
