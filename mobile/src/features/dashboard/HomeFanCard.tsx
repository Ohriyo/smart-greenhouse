import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { FanModeControl } from '@/components/greenhouse';
import { Card, Eyebrow, IconTile, Text } from '@/components/ui';
import { useSetFanMode } from '@/features/control/useSetFanMode';
import { useLiveStore } from '@/store/liveStore';
import { formatRelative, useNow } from '@/utils/time';

import { useIsLive } from './useLiveness';

/**
 * "VENTILATION FAN / Running · Changed 18 min ago" + Auto / On / Off.
 * Confirm-before-commit: the control shows the *confirmed* mode; a tap shows
 * "Waiting for device…" until telemetry confirms (10 s timeout → toast).
 */
export const HomeFanCard = memo(function HomeFanCard({ deviceId }: { deviceId: string }) {
  const fanOn = useLiveStore((s) => s.readings[deviceId]?.fanOn ?? null);
  const mode = useLiveStore((s) => s.readings[deviceId]?.fanMode ?? null);
  const changedAt = useLiveStore((s) => s.fanChangedAt[deviceId] ?? null);
  const live = useIsLive(deviceId);
  const { send, pendingMode } = useSetFanMode(deviceId);
  const now = useNow(15_000);

  const title = fanOn === null ? 'Fan state unknown' : fanOn ? 'Running' : 'Standing by';
  const caption = pendingMode
    ? 'Waiting for device…'
    : !live
      ? 'Greenhouse offline: the fan keeps following its own rules'
      : changedAt
        ? `Changed ${formatRelative(changedAt, now)}`
        : 'No changes recorded yet';

  return (
    <Card>
      <View style={styles.top}>
        <IconTile icon="mci-fan" tone={fanOn ? 'accent' : 'neutral'} size={44} />
        <View
          style={styles.text}
          accessible
          accessibilityLabel={`Ventilation fan, ${title}. ${caption}`}
        >
          <Eyebrow>Ventilation fan</Eyebrow>
          <Text variant="sectionTitle">{title}</Text>
          <Text variant="caption" color="secondary" accessibilityLiveRegion="polite">
            {caption}
          </Text>
        </View>
      </View>
      <View style={styles.control}>
        <FanModeControl mode={mode} pendingMode={pendingMode} live={live} onSelect={send} />
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  text: { flex: 1, gap: 2 },
  control: { marginTop: 16 },
});
