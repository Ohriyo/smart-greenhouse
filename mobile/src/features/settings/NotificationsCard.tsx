import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { EnableNotificationsCard } from '@/components/greenhouse';
import {
  BottomSheet,
  Button,
  Card,
  Divider,
  ErrorState,
  Icon,
  ListRow,
  Skeleton,
  Text,
  Toggle,
  useToast,
} from '@/components/ui';
import {
  useNotificationSettings,
  useSendTestPush,
  useUpdateNotificationSettings,
} from '@/features/notifications/queries';
import { describeError } from '@/services/api';
import { pushSupport, requestPermission } from '@/services/notifications';
import { useNotificationStore } from '@/store/notificationStore';
import { useTheme } from '@/theme';
import type { NotificationSettingsUpdate, Severity } from '@/types/api';

const SEVERITIES: readonly Severity[] = ['info', 'warning', 'critical'];

const SEVERITY_COPY: Record<Severity, { title: string; row: string; detail: string }> = {
  info: {
    title: 'Info',
    row: 'All alerts',
    detail: 'Every alert, including “back in range” and “back online”.',
  },
  warning: {
    title: 'Warning',
    row: 'Warning and critical',
    detail: 'Warnings and critical alerts (recommended).',
  },
  critical: {
    title: 'Critical',
    row: 'Critical only',
    detail: 'Only alerts for values far out of range.',
  },
};

/**
 * "NOTIFICATIONS": the push toggle (Android permission → registration → the server
 * preference) and the minimum severity, which is saved on the backend and applies
 * to every registered phone.
 */
export function NotificationsSection() {
  const theme = useTheme();
  const toast = useToast();
  const [support] = useState(pushSupport);
  const permission = useNotificationStore((s) => s.permission);
  const registration = useNotificationStore((s) => s.registration);
  const message = useNotificationStore((s) => s.message);

  const settings = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const test = useSendTestPush();
  const [picking, setPicking] = useState(false);

  const saved = settings.data;
  const on = support.ok && permission === 'granted' && saved?.enabled === true;

  const save = (body: NotificationSettingsUpdate) =>
    update.mutate(body, {
      onError: (err) => toast.show(`Not saved. ${describeError(err)}`, 'error'),
    });

  const toggle = async (next: boolean) => {
    if (!saved) return;
    if (!next) {
      save({ enabled: false, minSeverity: saved.minSeverity });
      return;
    }
    if (!support.ok) {
      toast.show(support.message, 'info');
      return;
    }
    let state = permission;
    if (state === 'ask' || state === 'unknown') state = await requestPermission();
    if (state === 'blocked') {
      toast.show('Notifications are blocked for this app. Opening Android settings…', 'info');
      void Linking.openSettings();
      return;
    }
    if (state === 'granted') save({ enabled: true, minSeverity: saved.minSeverity });
  };

  const sendTest = () =>
    test.mutate(undefined, {
      onSuccess: (r) =>
        r.sent > 0
          ? toast.show('Test sent. It should arrive in a few seconds.', 'success')
          : toast.show(
              r.tokens === 0
                ? 'No phone is registered on the server yet.'
                : 'The push service rejected it. Check the backend log.',
              'error',
            ),
      onError: (err) => toast.show(describeError(err), 'error'),
    });

  const subtitle = !support.ok
    ? 'Not available in Expo Go. Use the development build.'
    : permission === 'blocked'
      ? 'Blocked in Android settings'
      : permission !== 'granted'
        ? 'Allow notifications to get alerts when the app is closed'
        : registration === 'error'
          ? `Could not register this phone. ${message ?? ''}`.trim()
          : 'Receive important greenhouse alerts';

  return (
    <>
      {support.ok && (permission === 'ask' || permission === 'blocked') ? (
        <EnableNotificationsCard permission={permission} />
      ) : null}

      <Card>
        {saved ? (
          <>
            <ListRow
              title="Push notifications"
              subtitle={subtitle}
              icon="notifications-outline"
              trailing={
                <Toggle
                  value={on}
                  onValueChange={(v) => void toggle(v)}
                  accessibilityLabel="Push notifications"
                  accessibilityHint={subtitle}
                />
              }
            />
            <Divider />
            <ListRow
              title="Minimum severity"
              subtitle={SEVERITY_COPY[saved.minSeverity].row}
              icon="warning-outline"
              iconTone="warning"
              onPress={() => setPicking(true)}
            />
          </>
        ) : settings.isError ? (
          <ErrorState
            title="Couldn't load preferences"
            message={describeError(settings.error)}
            onRetry={() => void settings.refetch()}
            retrying={settings.isFetching}
          />
        ) : (
          <View accessibilityLabel="Loading notification settings" style={styles.loading}>
            <Skeleton height={44} />
            <Skeleton height={44} />
          </View>
        )}

        <Divider style={styles.divider} />
        <View style={styles.actions}>
          <Button
            label="Send test notification"
            variant="secondary"
            size="small"
            loading={test.isPending}
            disabled={registration !== 'registered'}
            onPress={sendTest}
          />
          <Button
            label="Android app settings"
            variant="ghost"
            size="small"
            onPress={() => void Linking.openSettings()}
            accessibilityHint="Notification and battery settings for this app"
          />
        </View>
        <Text variant="micro" color="tertiary" style={styles.hint}>
          Late notifications? Set Battery to “Unrestricted” for this app (see docs/setup-push.md).
        </Text>
      </Card>

      <BottomSheet
        visible={picking}
        onClose={() => setPicking(false)}
        eyebrow="Notifications"
        title="Minimum severity"
      >
        {SEVERITIES.map((severity) => {
          const copy = SEVERITY_COPY[severity];
          const selected = saved?.minSeverity === severity;
          return (
            <ListRow
              key={severity}
              title={copy.title}
              subtitle={copy.detail}
              accessibilityLabel={`${copy.title}. ${copy.detail}${selected ? ' Selected.' : ''}`}
              trailing={
                selected ? (
                  <Icon name="checkmark-circle" size={24} color={theme.colors.accent} />
                ) : (
                  <Icon name="ellipse-outline" size={24} color={theme.colors.border} />
                )
              }
              onPress={() => {
                if (saved && !selected) save({ enabled: saved.enabled, minSeverity: severity });
                setPicking(false);
              }}
            />
          );
        })}
        <Text variant="micro" color="tertiary">
          Saved on the server, for every registered phone.
        </Text>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { gap: 12 },
  divider: { marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, flexWrap: 'wrap' },
  hint: { marginTop: 8 },
});
