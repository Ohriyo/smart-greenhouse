import { memo, useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Eyebrow, Icon, Text } from '@/components/ui';
import { cardShadow, useTheme } from '@/theme';
import { useReducedMotion } from '@/utils/useReducedMotion';

interface FanHeroProps {
  running: boolean;
  /** "Fan is running" / "Fan is off". */
  title: string;
  /** "Last changed just now". */
  caption: string;
  /** Usually the Auto / On / Off control. */
  children?: ReactNode;
}

const DISC = 132;

/** Big soft-green disc with a fan icon that spins while the fan runs (Control screen). */
export const FanHero = memo(function FanHero({ running, title, caption, children }: FanHeroProps) {
  const theme = useTheme();
  const { colors } = theme;
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (running && !reducedMotion) {
      rotation.set(0);
      rotation.set(
        withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1, false),
      );
    } else {
      cancelAnimation(rotation);
      rotation.set(withTiming(0, { duration: 300 }));
    }
    return () => cancelAnimation(rotation);
  }, [running, reducedMotion, rotation]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceTint,
          borderColor: colors.accentSoft,
          boxShadow: cardShadow(theme),
        },
      ]}
    >
      <View
        style={[styles.disc, { backgroundColor: colors.surface, boxShadow: cardShadow(theme) }]}
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={spin}>
          <Icon name="mci-fan" size={82} color={colors.accent} />
        </Animated.View>
      </View>
      <View
        style={styles.text}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`Ventilation fan. ${title}. ${caption}`}
      >
        <Eyebrow>Ventilation fan</Eyebrow>
        <Text variant="sectionTitle" style={styles.title}>
          {title}
        </Text>
        <Text variant="caption" color="secondary">
          {caption}
        </Text>
      </View>
      {children ? <View style={styles.controls}>{children}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 16,
  },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { alignItems: 'center', gap: 4 },
  title: { fontSize: 22, lineHeight: 28 },
  controls: { alignSelf: 'stretch' },
});
