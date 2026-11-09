import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useNotificationStore } from '@/store/notificationStore';
import { useSettingsStore } from '@/store/settingsStore';

import { ensureAlertChannel, pushSupport, refreshPermission, registerForPush } from './push';

/**
 * Keeps this phone's push registration in sync. Renders nothing.
 * - creates the "Greenhouse alerts" channel and reads the permission at start
 * - re-reads the permission when the app returns to the foreground (it may have
 *   been changed in Android settings)
 * - registers the Expo push token with the backend whenever the server address
 *   or the permission changes, and again when FCM rotates the token
 * Asking for permission is never done here: the UI explains first (Alerts/Settings).
 */
export function NotificationsBridge() {
  const apiUrl = useSettingsStore((s) => s.apiUrl);
  const settingsHydrated = useSettingsStore((s) => s.hydrated);
  const storeHydrated = useNotificationStore((s) => s.hydrated);
  const permission = useNotificationStore((s) => s.permission);

  useEffect(() => {
    ensureAlertChannel().catch(() => undefined);
    refreshPermission().catch(() => undefined);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermission().catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!settingsHydrated || !storeHydrated || !apiUrl || permission !== 'granted') return;
    void registerForPush(apiUrl);
  }, [apiUrl, settingsHydrated, storeHydrated, permission]);

  useEffect(() => {
    // Expo Go has no push tokens: adding the listener there would throw.
    if (!apiUrl || !pushSupport().ok) return;
    const sub = Notifications.addPushTokenListener(() => {
      if (useNotificationStore.getState().registration !== 'registering') {
        void registerForPush(apiUrl);
      }
    });
    return () => sub.remove();
  }, [apiUrl]);

  return null;
}
