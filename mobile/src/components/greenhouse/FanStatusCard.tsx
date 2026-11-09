import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Card, StatusPill, Text } from '@/components/ui';
import { toneColors, useTheme } from '@/theme';
import type { FanMode } from '@/types/api';
import { formatValue } from '@/utils/sensors';
import { useReducedMotion } from '@/utils/useReducedMotion';

interface FanStatusCardProps {
  fanOn: boolean;
  fanMode: FanMode;
  fanOnTemp: number;
  fanOffTemp: number;
  deviceOnline: boolean;
  onPress?: () => void;
}

const MODE_LABEL: Record<FanMode, string> = { auto: 'Auto', on: 'Forced on', off: 'Forced off' };

export function FanStatusCard({
  fanOn,
  fanMode,
  fanOnTemp,
  fanOffTemp,
  deviceOnline,
  onPress,
}: FanStatusCardProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  // Created once; useState (not useRef().current) keeps the React Compiler rules happy.
  const [spin] = useState(() => new Animated.Value(0));
  const spinning = fanOn && deviceOnline && !reducedMotion;

  useEffect(() => {
    if (!spinning) {
      spin.stopAnimation();
      return;
    }
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin, spinning]);

  const tone = !deviceOnline ? 'offline' : fanOn ? 'accent' : 'neutral';
  const colors = toneColors(theme, tone);
  const state = !deviceOnline ? 'Unknown' : fanOn ? 'Running' : 'Stopped';
  const detail =
    fanMode === 'auto'
      ? `On at ${formatValue(fanOnTemp, 1)} °C · off at ${formatValue(fanOffTemp, 1)} °C`
      : 'Manual override, thresholds ignored';
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`Fan ${state}, mode ${MODE_LABEL[fanMode]}. ${detail}`}
      accessibilityHint={onPress ? 'Opens fan control' : undefined}
    >
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        <View style={[styles.iconWrap, { backgroundColor: colors.bg }]}>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <MaterialCommunityIcons name="fan" size={30} color={colors.fg} />
          </Animated.View>
        </View>
        <View style={styles.text}>
          <Text variant="caption" color="secondary">
            Ventilation fan
          </Text>
          <Text variant="heading">{state}</Text>
          <Text variant="caption" color="tertiary" numberOfLines={2}>
            {detail}
          </Text>
        </View>
        <StatusPill tone={fanMode === 'auto' ? 'accent' : 'warning'} label={MODE_LABEL[fanMode]} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});
