import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { ConnectionState } from '@/components/greenhouse';
import { UpdatedAgo } from '@/components/greenhouse';
import { Eyebrow, IconButton, StatusPill, Text } from '@/components/ui';
import { toneColors, useTheme, type StatusTone } from '@/theme';
import { useReducedMotion } from '@/utils/useReducedMotion';

interface HomeHeaderProps {
  deviceId: string;
  deviceName: string;
  connection: ConnectionState;
  deviceOnline: boolean | undefined;
  onRefresh: () => void;
  refreshing: boolean;
}

const INDICATOR: Record<ConnectionState, { tone: StatusTone; label: string }> = {
  connected: { tone: 'ok', label: 'Live' },
  connecting: { tone: 'warning', label: 'Connecting' },
  reconnecting: { tone: 'warning', label: 'Connecting' },
  'device-offline': { tone: 'offline', label: 'Offline' },
  'phone-offline': { tone: 'offline', label: 'Offline' },
  away: { tone: 'offline', label: 'Offline' },
  'backend-unreachable': { tone: 'offline', label: 'Offline' },
};

/** Server-connection pill: what the *app* link is doing. */
const LINK: Record<ConnectionState, { tone: StatusTone; label: string }> = {
  connected: { tone: 'ok', label: 'Connected' },
  'device-offline': { tone: 'ok', label: 'Connected' },
  connecting: { tone: 'warning', label: 'Connecting' },
  reconnecting: { tone: 'warning', label: 'Reconnecting' },
  'phone-offline': { tone: 'danger', label: 'No internet' },
  away: { tone: 'offline', label: 'Away from home' },
  'backend-unreachable': { tone: 'danger', label: 'Server unreachable' },
};

/** "MY GREENHOUSE / Greenhouse 01 · ● LIVE", connection pills, "Updated 2 s ago" + refresh. */
export const HomeHeader = memo(function HomeHeader({
  deviceId,
  deviceName,
  connection,
  deviceOnline,
  onRefresh,
  refreshing,
}: HomeHeaderProps) {
  const indicator = INDICATOR[connection];
  const link = LINK[connection];
  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Eyebrow>My greenhouse</Eyebrow>
          <Text variant="title" accessibilityRole="header" numberOfLines={1}>
            {deviceName}
          </Text>
        </View>
        <LiveIndicator
          tone={indicator.tone}
          label={indicator.label}
          pulse={connection === 'connected'}
        />
      </View>
      <View style={styles.pillsRow}>
        <View style={styles.pills}>
          <StatusPill
            tone={link.tone}
            label={link.label}
            variant="outline"
            icon={link.tone === 'ok' ? 'wifi' : 'cloud-offline-outline'}
          />
          {deviceOnline !== undefined ? (
            <StatusPill
              tone={deviceOnline ? 'ok' : 'offline'}
              label={deviceOnline ? 'Device online' : 'Device offline'}
              variant="outline"
            />
          ) : null}
        </View>
        <View style={styles.updated}>
          <UpdatedAgo deviceId={deviceId} prefix="Updated" color="secondary" />
          <IconButton
            icon="refresh"
            onPress={onRefresh}
            disabled={refreshing}
            variant="ghost"
            size="small"
            accessibilityLabel="Refresh"
            accessibilityHint="Loads the latest readings from the server"
          />
        </View>
      </View>
    </View>
  );
});

/** Green pulsing dot + "LIVE" (amber "CONNECTING", gray "OFFLINE"). */
function LiveIndicator({
  tone,
  label,
  pulse,
}: {
  tone: StatusTone;
  label: string;
  pulse: boolean;
}) {
  const theme = useTheme();
  const { fg } = toneColors(theme, tone);
  const reducedMotion = useReducedMotion();
  const ring = useSharedValue(0);

  useEffect(() => {
    if (pulse && !reducedMotion) {
      ring.set(
        withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false),
      );
    } else {
      ring.set(0);
    }
  }, [pulse, reducedMotion, ring]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - ring.value),
    transform: [{ scale: 1 + ring.value * 1.6 }],
  }));

  return (
    <View style={styles.indicator} accessible accessibilityLabel={`Connection: ${label}`}>
      <View style={styles.dotWrap}>
        <Animated.View style={[styles.dot, styles.ring, { backgroundColor: fg }, ringStyle]} />
        <View style={[styles.dot, { backgroundColor: fg }]} />
      </View>
      <Text variant="eyebrow" tint={fg}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  titleText: { flex: 1, gap: 4 },
  indicator: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 8 },
  dotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  ring: { position: 'absolute' },
  pillsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pills: { flexDirection: 'row', gap: 6, flexShrink: 1, flexWrap: 'wrap' },
  updated: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
});
