import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Text, type IconName } from '@/components/ui';
import { toneColors, useTheme, type StatusTone } from '@/theme';
import { formatRelative } from '@/utils/time';

export type ConnectionState =
  | 'connected'
  | 'reconnecting' // app ↔ backend socket dropped, retrying
  | 'backend-unreachable' // app can't reach the laptop
  | 'device-offline'; // backend is fine, the ESP32 is not

interface ConnectionBannerProps {
  state: ConnectionState;
  /** Device lastSeen, for the device-offline message. */
  lastSeen?: string | null;
  now: number;
}

const CONFIG: Record<
  Exclude<ConnectionState, 'connected'>,
  { tone: StatusTone; icon: IconName; title: string }
> = {
  reconnecting: { tone: 'warning', icon: 'sync', title: 'Reconnecting to the backend…' },
  'backend-unreachable': {
    tone: 'danger',
    icon: 'cloud-offline-outline',
    title: "Can't reach the backend",
  },
  'device-offline': { tone: 'offline', icon: 'radio-outline', title: 'Greenhouse is offline' },
};

/** Shown above the content when live data may be stale. Renders nothing when connected. */
export function ConnectionBanner({ state, lastSeen = null, now }: ConnectionBannerProps) {
  const theme = useTheme();
  if (state === 'connected') return null;

  const cfg = CONFIG[state];
  const { fg, bg } = toneColors(theme, cfg.tone);
  const detail =
    state === 'device-offline'
      ? `Last data ${formatRelative(lastSeen, now)}. The fan keeps running on its own.`
      : state === 'backend-unreachable'
        ? 'Check that the laptop is on and on the same Wi-Fi. Showing the last known values.'
        : 'Values may be a few seconds old.';

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${cfg.title}. ${detail}`}
      style={[styles.banner, { backgroundColor: bg, borderRadius: theme.radii.md }]}
    >
      <Ionicons name={cfg.icon} size={22} color={fg} />
      <View style={styles.text}>
        <Text variant="bodyStrong" tint={fg}>
          {cfg.title}
        </Text>
        <Text variant="caption" color="secondary">
          {detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', gap: 12, padding: 14, alignItems: 'flex-start' },
  text: { flex: 1, gap: 2 },
});
