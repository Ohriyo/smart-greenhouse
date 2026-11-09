import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components/ui';
import { toneColors, useTheme, type StatusTone } from '@/theme';
import { formatValue } from '@/utils/sensors';
import { formatRelative, useNow } from '@/utils/time';

interface ThresholdSyncStatusProps {
  /** Fan thresholds saved on the backend. */
  savedOn: number;
  savedOff: number;
  /** What the device last reported using (null = never reported). */
  reportedOn: number | null;
  reportedOff: number | null;
  reportedAt: string | null;
  online: boolean;
}

export type ThresholdSync = 'applied' | 'waiting' | 'offline' | 'unknown';

const same = (a: number, b: number) => Math.abs(a - b) < 0.05;

export function thresholdSync(p: ThresholdSyncStatusProps): ThresholdSync {
  if (p.reportedOn === null || p.reportedOff === null) return p.online ? 'unknown' : 'offline';
  if (same(p.reportedOn, p.savedOn) && same(p.reportedOff, p.savedOff)) return 'applied';
  return p.online ? 'waiting' : 'offline';
}

const LOOK: Record<ThresholdSync, { tone: StatusTone; icon: IconName | null }> = {
  applied: { tone: 'ok', icon: 'checkmark' },
  waiting: { tone: 'warning', icon: null },
  offline: { tone: 'offline', icon: 'cloud-offline-outline' },
  unknown: { tone: 'neutral', icon: 'help-circle-outline' },
};

/**
 * Has the ESP32 acknowledged the saved fan thresholds? It reports the values it
 * uses in every telemetry message (contract: Device.reportedFanOnTemp/OffTemp).
 * "✓ Device acknowledged current settings" appears only when they match.
 */
export function ThresholdSyncStatus(props: ThresholdSyncStatusProps) {
  const theme = useTheme();
  const now = useNow(5000);
  const sync = thresholdSync(props);
  const { tone, icon } = LOOK[sync];
  const colors = toneColors(theme, tone);
  const using =
    props.reportedOn !== null && props.reportedOff !== null
      ? `${formatValue(props.reportedOn, 1)} / ${formatValue(props.reportedOff, 1)} °C`
      : null;

  let title: string;
  let detail: string;
  switch (sync) {
    case 'applied':
      title = 'Device acknowledged current settings';
      detail = `Fan thresholds confirmed ${formatRelative(props.reportedAt, now)}. Alert limits are checked by the server.`;
      break;
    case 'waiting':
      title = 'Waiting for the device…';
      detail = `It is still using ${using ?? 'other values'} for the fan.`;
      break;
    case 'offline':
      title = 'Saved, not yet applied';
      detail =
        'The greenhouse is offline and gets the new fan thresholds when it reconnects.' +
        (using ? ` Last known: ${using}.` : '');
      break;
    case 'unknown':
      title = 'Not confirmed yet';
      detail = 'The greenhouse has not reported its fan thresholds yet.';
      break;
  }

  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${detail}`}
      accessibilityLiveRegion="polite"
      style={styles.row}
    >
      <View style={styles.icon}>
        {icon ? (
          <Icon name={icon} size={16} color={colors.fg} />
        ) : (
          <ActivityIndicator size="small" color={colors.fg} />
        )}
      </View>
      <View style={styles.text}>
        <Text variant="caption" tint={colors.fg}>
          {title}
        </Text>
        <Text variant="micro" color="secondary">
          {detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  icon: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  text: { flex: 1, gap: 2 },
});
