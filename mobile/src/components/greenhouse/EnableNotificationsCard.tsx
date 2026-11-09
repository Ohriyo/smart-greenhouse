import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { requestPermission } from '@/services/notifications';
import type { PermissionState } from '@/store/notificationStore';
import { toneColors, useTheme } from '@/theme';

interface EnableNotificationsCardProps {
  permission: Exclude<PermissionState, 'granted'>;
  /** Shows a "Not now" button (Alerts screen). */
  onDismiss?: () => void;
}

/**
 * Explain-then-request: says what the notifications are for *before* Android's
 * permission dialog, which can only be shown a limited number of times. When
 * the permission is blocked, it links to the app's Android settings instead.
 */
export function EnableNotificationsCard({ permission, onDismiss }: EnableNotificationsCardProps) {
  const theme = useTheme();
  const accent = toneColors(theme, 'accent');
  const [asking, setAsking] = useState(false);
  const blocked = permission === 'blocked';

  const enable = async () => {
    setAsking(true);
    try {
      // Granted → NotificationsBridge registers the token. Denied twice → the
      // card switches to "Open Android settings" (the store holds the state).
      await requestPermission();
    } finally {
      setAsking(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: accent.bg }]}>
          <Ionicons name="notifications" size={22} color={accent.fg} />
        </View>
        <Text variant="heading" style={styles.flex} accessibilityRole="header">
          Get alerts when the app is closed
        </Text>
      </View>
      <Text color="secondary">
        {blocked
          ? 'Notifications are turned off for this app. Turn them on in Android settings → Notifications to be warned about the greenhouse while the app is closed.'
          : 'Your phone will notify you when temperature, humidity, soil moisture or light leave their limits, or when the greenhouse goes offline. Android asks for permission next.'}
      </Text>
      <View style={styles.actions}>
        <Button
          label={blocked ? 'Open Android settings' : 'Turn on notifications'}
          icon={blocked ? 'settings-outline' : 'notifications-outline'}
          onPress={() => void (blocked ? Linking.openSettings() : enable())}
          loading={asking}
          fullWidth
        />
        {onDismiss ? (
          <Button label="Not now" variant="ghost" onPress={onDismiss} fullWidth />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  actions: { gap: 6 },
});
