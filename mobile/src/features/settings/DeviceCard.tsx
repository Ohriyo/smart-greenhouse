import { memo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { SignalBars } from '@/components/greenhouse';
import {
  BottomSheet,
  Button,
  Card,
  Divider,
  IconTile,
  ListRow,
  StatusPill,
  Text,
  TextField,
  useToast,
} from '@/components/ui';
import { describeError } from '@/services/api';
import { useLiveness } from '@/features/dashboard/useLiveness';
import { useLiveStore } from '@/store/liveStore';
import { toneColors, useTheme } from '@/theme';
import { DeviceRenameSchema } from '@/types/api';
import { formatRssi, signalOf } from '@/utils/signal';
import { formatRelative, formatUptime, useNow } from '@/utils/time';

import { useRenameDevice } from './useRenameDevice';

/** An uptime report older than this is not trusted (telemetry arrives every ~5 s). */
const UPTIME_FRESH_MS = 60_000;

/** "DEVICE": name, id, online state, and last seen / Wi-Fi signal / uptime from real telemetry. */
export const DeviceCard = memo(function DeviceCard() {
  const deviceId = useLiveStore((s) => s.deviceIds[0]);
  if (!deviceId) {
    return (
      <Card>
        <Text variant="caption" color="secondary">
          No greenhouse yet. It appears here as soon as it sends data.
        </Text>
      </Card>
    );
  }
  return <DeviceDetails deviceId={deviceId} />;
});

function DeviceDetails({ deviceId }: { deviceId: string }) {
  const theme = useTheme();
  const device = useLiveStore((s) => s.devices[deviceId]);
  const rssi = useLiveStore((s) => s.readings[deviceId]?.rssi ?? null);
  const liveness = useLiveness(deviceId);
  const now = useNow(5000);
  const [renaming, setRenaming] = useState(false);

  const live = liveness === 'live';
  const pill =
    liveness === 'live'
      ? { tone: 'ok' as const, label: 'Online' }
      : liveness === 'offline'
        ? { tone: 'offline' as const, label: 'Offline' }
        : { tone: 'offline' as const, label: 'Last known' };

  // Values from a device that is not live would be misleading: show a dash.
  const lastSeen = device?.lastSeen ? capitalize(formatRelative(device.lastSeen, now)) : '—';
  const signal = live && rssi !== null ? signalOf(rssi) : null;
  // Uptime counts up from the last report, but only while reports keep coming: the backend
  // keeps the last value forever, and firmware that doesn't send uptime (or a stale value from
  // an old run) must show "—", not an ever-growing wrong number.
  const reportAgeMs = device?.uptimeAt ? now - Date.parse(device.uptimeAt) : Infinity;
  const uptimeSec =
    live && device?.uptimeSec != null && reportAgeMs <= UPTIME_FRESH_MS
      ? device.uptimeSec + Math.max(0, reportAgeMs / 1000)
      : null;
  const signalColor =
    signal === null
      ? theme.colors.textTertiary
      : signal.bars >= 3
        ? toneColors(theme, 'ok').fg
        : signal.bars === 2
          ? toneColors(theme, 'warning').fg
          : toneColors(theme, 'danger').fg;

  const name = device?.name ?? deviceId;

  return (
    <Card>
      <View style={styles.head}>
        <IconTile icon="mci-sprout-outline" tone="accent" size={44} />
        <View style={styles.headText}>
          <Text variant="heading" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" color="secondary" selectable numberOfLines={1}>
            Device ID · {deviceId}
          </Text>
        </View>
        <StatusPill tone={pill.tone} label={pill.label} variant="plain" />
      </View>

      <Divider style={styles.divider} />

      <View style={styles.stats}>
        <Stat label="Last seen" value={lastSeen} />
        <Stat
          label="Signal"
          value={signal && rssi !== null ? formatRssi(rssi) : '—'}
          spoken={signal && rssi !== null ? `${signal.label}, ${rssi} dBm` : 'unknown'}
          leading={signal ? <SignalBars bars={signal.bars} color={signalColor} /> : null}
        />
        <Stat
          label="Uptime"
          value={uptimeSec === null ? '—' : formatUptime(uptimeSec)}
          spoken={uptimeSec === null ? 'unknown' : formatUptime(uptimeSec)}
        />
      </View>

      <Divider style={styles.divider} />
      <ListRow
        title="Rename greenhouse"
        subtitle={name}
        icon="create-outline"
        onPress={() => setRenaming(true)}
      />

      <RenameSheet
        deviceId={deviceId}
        currentName={name}
        visible={renaming}
        onClose={() => setRenaming(false)}
      />
    </Card>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Stat({
  label,
  value,
  spoken,
  leading,
}: {
  label: string;
  value: string;
  spoken?: string;
  leading?: ReactNode;
}) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${spoken ?? value}`}>
      <Text variant="micro" color="secondary">
        {label}
      </Text>
      <View style={styles.statValue}>
        {leading}
        <Text variant="bodyStrong" tabular numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
    </View>
  );
}

function RenameSheet({
  deviceId,
  currentName,
  visible,
  onClose,
}: {
  deviceId: string;
  currentName: string;
  visible: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const rename = useRenameDevice(deviceId);
  const [text, setText] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  // Start from the saved name each time the sheet opens (adjusted during render).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setText(currentName);
      setError(null);
    }
  }

  const parsed = DeviceRenameSchema.safeParse({ name: text });
  const unchanged = parsed.success && parsed.data.name === currentName;

  const save = () => {
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid name');
      return;
    }
    if (unchanged) {
      onClose();
      return;
    }
    rename.mutate(parsed.data.name, {
      onSuccess: (device) => {
        toast.show(`Renamed to “${device.name}”`, 'success');
        onClose();
      },
      onError: (err) => setError(describeError(err)),
    });
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} eyebrow="Device" title="Rename greenhouse">
      <TextField
        label="Greenhouse name"
        value={text}
        onChangeText={(t) => {
          setText(t);
          setError(null);
        }}
        placeholder="Greenhouse 01"
        maxLength={40}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
        error={error}
        hint={`Shown as the title in the app. The device ID (${deviceId}) doesn’t change.`}
      />
      <View style={styles.sheetActions}>
        <Button
          label="Save name"
          fullWidth
          loading={rename.isPending}
          disabled={!parsed.success || unchanged}
          onPress={save}
        />
        <Button label="Cancel" variant="secondary" fullWidth onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, gap: 2 },
  divider: { marginVertical: 14 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, gap: 4 },
  statValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetActions: { gap: 10, marginTop: 8 },
});
