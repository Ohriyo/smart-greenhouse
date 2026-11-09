import { useMutation, useQuery } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  BottomSheet,
  Button,
  ListRow,
  Text,
  Toggle,
  useToast,
  type IconName,
} from '@/components/ui';
import { useServer } from '@/features/dashboard/queries';
import { api, describeError, HttpError } from '@/services/api';
import {
  ALERT_CHANNEL_ID,
  ensureAlertChannel,
  refreshPermission,
  requestPermission,
} from '@/services/notifications/push';
import { selectDemoActive, useDemoStore } from '@/store/demoStore';
import { useLiveStore } from '@/store/liveStore';
import { useTheme, type StatusTone } from '@/theme';
import type { DevStatus, SimScenario } from '@/types/api';

/** The prototype's sample notification (the backend's `demo` preset sends the same text). */
const DEMO_PUSH = {
  title: 'Greenhouse alert',
  body: 'Air temperature 33.1 °C — fan turned on',
} as const;

interface ScenarioRow {
  scenario: SimScenario;
  title: string;
  subtitle: string;
  icon: IconName;
  tone: StatusTone;
  done: string;
}

const SCENARIOS: readonly ScenarioRow[] = [
  {
    scenario: 'heatwave',
    title: 'Simulate heat wave',
    subtitle: 'Push temperature past 32 °C',
    icon: 'mci-thermometer',
    tone: 'danger',
    done: 'Heat wave started: the temperature rises within seconds.',
  },
  {
    scenario: 'drysoil',
    title: 'Simulate dry soil',
    subtitle: 'Drop moisture below 30%',
    icon: 'mci-sprout-outline',
    tone: 'warning',
    done: 'Dry soil started: moisture drops below 30 %.',
  },
  {
    scenario: 'normal',
    title: 'Back to normal',
    subtitle: 'End both scenarios',
    icon: 'refresh',
    tone: 'accent',
    done: 'Back to normal: readings settle again.',
  },
];

/** Why the scenario rows are disabled, or null when they work. */
function scenarioBlock(
  deviceId: string | undefined,
  status: { isPending: boolean; isError: boolean; error: unknown; data: DevStatus | undefined },
): string | null {
  if (!deviceId) return 'No greenhouse yet.';
  if (status.isPending) return 'Checking the backend…';
  if (status.isError) {
    return status.error instanceof HttpError && status.error.status === 404
      ? 'Start the backend with DEV_TOOLS=true (backend/.env) to use scenarios.'
      : 'Can’t reach the backend.';
  }
  if (!status.data?.simulated.includes(deviceId)) {
    return `“${deviceId}” is the real greenhouse. Scenarios only work with the simulator (npm run sim in backend/), so real hardware is never changed.`;
  }
  return null;
}

/**
 * "Presentation tools": client-side overrides (offline, server unreachable, pause,
 * dark mode), scenario buttons that drive the *simulator* through the backend's
 * DEV_TOOLS endpoint, and a demo push notification. Not part of the ETanim app.
 */
export function DemoSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { apiUrl, ready } = useServer();
  const deviceId = useLiveStore((s) => s.deviceIds[0]);
  const demo = useDemoStore();
  const active = useDemoStore(selectDemoActive);
  const [pushing, setPushing] = useState(false);

  const status = useQuery({
    queryKey: ['devStatus', apiUrl],
    enabled: visible && ready,
    queryFn: ({ signal }) => api.devStatus(signal),
    retry: false,
    gcTime: 0,
  });
  const blocked = scenarioBlock(deviceId, status);

  const run = useMutation({
    mutationFn: (row: ScenarioRow) => api.simulate(deviceId ?? '', row.scenario),
    onSuccess: (_res, row) => toast.show(row.done, 'success'),
    onError: (err) => toast.show(describeError(err), 'error'),
  });

  /** Backend push; where that isn't possible (Expo Go, no registered phone) the same notification is shown locally. */
  const triggerPush = async () => {
    setPushing(true);
    try {
      let sent = 0;
      try {
        sent = (await api.sendTestPush('demo')).sent;
      } catch {
        sent = 0; // backend unreachable: fall back to the local notification
      }
      if (sent > 0) {
        toast.show('Push sent. Press Home (leave the app) to see it arrive.', 'success');
        return;
      }
      const allowed =
        (await refreshPermission()) === 'granted' || (await requestPermission()) === 'granted';
      if (!allowed) {
        toast.show('Allow notifications for this app first (Android settings).', 'error');
        return;
      }
      await ensureAlertChannel();
      await Notifications.scheduleNotificationAsync({
        content: { ...DEMO_PUSH, data: { url: '/alerts' } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
          channelId: ALERT_CHANNEL_ID,
        },
      });
      toast.show(
        'No phone is registered for push (Expo Go?), so the same notification appears locally in 5 s. Press Home to see it.',
        'info',
      );
    } catch (err) {
      toast.show(describeError(err), 'error');
    } finally {
      setPushing(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      eyebrow="Demo controls"
      eyebrowTint={colors.demo}
      title="Presentation tools"
    >
      <View style={[styles.notice, { backgroundColor: colors.demoSoft }]}>
        <Text variant="caption" tint={colors.demo}>
          These controls are not part of the ETanim app.
        </Text>
      </View>

      {SCENARIOS.map((row) =>
        blocked ? (
          <View key={row.scenario} style={styles.disabled}>
            <ListRow
              title={row.title}
              subtitle={row.subtitle}
              icon={row.icon}
              iconTone={row.tone}
            />
          </View>
        ) : (
          <ListRow
            key={row.scenario}
            title={row.title}
            subtitle={row.subtitle}
            icon={row.icon}
            iconTone={row.tone}
            onPress={() => run.mutate(row)}
          />
        ),
      )}
      {blocked ? (
        <Text variant="caption" color="secondary" accessibilityLiveRegion="polite">
          {blocked}
        </Text>
      ) : null}

      <ListRow
        title="Device offline"
        subtitle="Show the greenhouse as offline"
        trailing={
          <Toggle
            value={demo.deviceOffline}
            onValueChange={(deviceOffline) => demo.set({ deviceOffline })}
            accessibilityLabel="Device offline"
          />
        }
      />
      <ListRow
        title="Server unreachable"
        subtitle="Show the server as unreachable"
        trailing={
          <Toggle
            value={demo.serverUnreachable}
            onValueChange={(serverUnreachable) => demo.set({ serverUnreachable })}
            accessibilityLabel="Server unreachable"
          />
        }
      />
      <ListRow
        title="Pause live updates"
        subtitle="Freeze the screen (alerts still arrive)"
        trailing={
          <Toggle
            value={demo.pauseLive}
            onValueChange={(pauseLive) => demo.set({ pauseLive })}
            accessibilityLabel="Pause live updates"
          />
        }
      />
      <ListRow
        title="Dark mode"
        subtitle="Force the dark theme"
        trailing={
          <Toggle
            value={demo.darkMode}
            onValueChange={(darkMode) => demo.set({ darkMode })}
            accessibilityLabel="Dark mode"
          />
        }
      />

      <Button
        label="Trigger push notification"
        variant="demo"
        icon="phone-portrait-outline"
        fullWidth
        loading={pushing}
        onPress={() => void triggerPush()}
      />
      {active ? (
        <Button
          label="Reset overrides"
          variant="ghost"
          size="small"
          onPress={demo.reset}
          style={styles.reset}
        />
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  notice: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  disabled: { opacity: 0.5 },
  reset: { alignSelf: 'center' },
});
