import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button, Icon, Text, type IconName } from '@/components/ui';
import { toneColors, useTheme, type StatusTone } from '@/theme';
import { manilaTime } from '@/utils/manilaTime';
import { formatRelative, useNow } from '@/utils/time';

export type ConnectionState =
  | 'connected'
  | 'connecting' // first connection / back from the background
  | 'reconnecting' // live connection dropped, retrying with backoff
  | 'phone-offline' // no internet at all
  | 'backend-unreachable' // the server doesn't answer (asleep, starting up, or down)
  | 'device-offline'; // the server is fine, the ESP32 is not

interface ConnectionBannerProps {
  state: ConnectionState;
  /** Device lastSeen, for the device-offline message. */
  lastSeen?: string | null;
  /** Time of the newest reading shown on screen (how old the saved data is). */
  dataTs?: string | null;
  /** "Retry now" for the states where trying again immediately can help. */
  onRetry?: () => void;
}

const CONFIG: Record<
  Exclude<ConnectionState, 'connected'>,
  { tone: StatusTone; icon: IconName; title: string }
> = {
  connecting: { tone: 'neutral', icon: 'radio-outline', title: 'Connecting to the greenhouse…' },
  reconnecting: { tone: 'warning', icon: 'sync', title: 'Reconnecting…' },
  'phone-offline': {
    tone: 'danger',
    icon: 'cloud-offline-outline',
    title: 'You’re offline',
  },
  'backend-unreachable': {
    tone: 'danger',
    icon: 'server-outline',
    title: "Can't reach the server",
  },
  'device-offline': { tone: 'offline', icon: 'radio-outline', title: 'Greenhouse is offline' },
};

/** States where "Retry now" is offered. */
const RETRYABLE: ReadonlySet<ConnectionState> = new Set(['backend-unreachable', 'reconnecting']);

/** "Greenhouse offline since 14:05" (Asia/Manila, like the rest of the app). */
function titleFor(state: Exclude<ConnectionState, 'connected'>, lastSeen: string | null): string {
  if (state === 'device-offline' && lastSeen)
    return `Greenhouse offline since ${manilaTime(lastSeen)}`;
  return CONFIG[state].title;
}

/** Brief reconnects (resume from background, Wi-Fi blip) don't flash a banner. */
const TRANSIENT_DELAY_MS = 2000;

function useSettledState(state: ConnectionState): ConnectionState {
  const transient = state === 'connecting' || state === 'reconnecting';
  const [overdue, setOverdue] = useState<ConnectionState | null>(null);
  // A new episode starts hidden again (adjusting state during render, not in an effect).
  if (!transient && overdue !== null) setOverdue(null);
  useEffect(() => {
    if (!transient) return;
    const t = setTimeout(() => setOverdue(state), TRANSIENT_DELAY_MS);
    return () => clearTimeout(t);
  }, [state, transient]);
  if (!transient) return state;
  return overdue === state ? state : 'connected';
}

function detailFor(
  state: Exclude<ConnectionState, 'connected'>,
  saved: string,
  lastSeen: string,
): string {
  switch (state) {
    case 'phone-offline':
      return Platform.OS === 'android'
        ? `No internet connection. ${saved} Alerts arrive as push notifications once the phone is online again.`
        : `No internet connection. ${saved}`;
    case 'backend-unreachable':
      return `The free server sleeps when idle and takes up to a minute to start, or it may be down. ${saved}`;
    case 'device-offline':
      return `No data since then (last data ${lastSeen}).`;
    case 'connecting':
      return 'Loading the latest readings.';
    case 'reconnecting':
      return 'The live connection dropped. Values may be a few seconds old.';
  }
}

/** Shown above the content when live data may be stale. Renders nothing when connected. */
export function ConnectionBanner({
  state,
  lastSeen = null,
  dataTs = null,
  onRetry,
}: ConnectionBannerProps) {
  const theme = useTheme();
  const now = useNow(5000); // own clock: the screen doesn't re-render for it
  const shown = useSettledState(state);
  if (shown === 'connected') return null;

  const cfg = CONFIG[shown];
  const { fg, bg } = toneColors(theme, cfg.tone);
  const saved = dataTs
    ? `Showing saved data from ${formatRelative(dataTs, now)}.`
    : 'No saved data yet.';
  const title = titleFor(shown, lastSeen);
  const detail = detailFor(shown, saved, formatRelative(lastSeen, now));

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${title}. ${detail}`}
      style={[styles.banner, { backgroundColor: bg, borderRadius: theme.radii.md }]}
    >
      <Icon name={cfg.icon} size={22} color={fg} />
      <View style={styles.text}>
        <Text variant="bodyStrong" tint={fg}>
          {title}
        </Text>
        <Text variant="caption" color="secondary">
          {detail}
        </Text>
        {onRetry && RETRYABLE.has(shown) ? (
          <Button
            label="Retry now"
            variant="secondary"
            size="small"
            onPress={onRetry}
            style={styles.retry}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', gap: 12, padding: 14, alignItems: 'flex-start' },
  text: { flex: 1, gap: 2 },
  retry: { marginTop: 8 },
});
