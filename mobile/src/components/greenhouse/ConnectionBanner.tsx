import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Text, type IconName } from '@/components/ui';
import { toneColors, useTheme, type StatusTone } from '@/theme';
import { formatRelative, useNow } from '@/utils/time';

export type ConnectionState =
  | 'connected'
  | 'connecting' // first connection since start / server change
  | 'reconnecting' // app ↔ backend socket dropped, retrying
  | 'backend-unreachable' // app can't reach the laptop
  | 'device-offline'; // backend is fine, the ESP32 is not

interface ConnectionBannerProps {
  state: ConnectionState;
  /** Device lastSeen, for the device-offline message. */
  lastSeen?: string | null;
}

const CONFIG: Record<
  Exclude<ConnectionState, 'connected'>,
  { tone: StatusTone; icon: IconName; title: string }
> = {
  connecting: { tone: 'neutral', icon: 'radio-outline', title: 'Connecting to the greenhouse…' },
  reconnecting: { tone: 'warning', icon: 'sync', title: 'Reconnecting to the backend…' },
  'backend-unreachable': {
    tone: 'danger',
    icon: 'cloud-offline-outline',
    title: "Can't reach the backend",
  },
  'device-offline': { tone: 'offline', icon: 'radio-outline', title: 'Greenhouse is offline' },
};

/** Shown above the content when live data may be stale. Renders nothing when connected. */
export function ConnectionBanner({ state, lastSeen = null }: ConnectionBannerProps) {
  const theme = useTheme();
  const now = useNow(5000); // own clock: the screen doesn't re-render for it
  if (state === 'connected') return null;

  const cfg = CONFIG[state];
  const { fg, bg } = toneColors(theme, cfg.tone);
  const detail =
    state === 'device-offline'
      ? `Last data ${formatRelative(lastSeen, now)}. The fan keeps running on its own.`
      : state === 'backend-unreachable'
        ? 'Check that the backend is running and the phone is on the same Wi-Fi. Showing the last known values.'
        : state === 'connecting'
          ? 'Opening the live connection to your laptop.'
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
