import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { isRunningInExpoGo } from 'expo';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { z } from 'zod';

import { api, describeError } from '@/services/api';
import { useNotificationStore, type PermissionState } from '@/store/notificationStore';

/** Must match the backend's ALERT_CHANNEL_ID (backend/src/push/sender.ts). */
export const ALERT_CHANNEL_ID = 'greenhouse-alerts';

export type PushSupport =
  | { ok: true; projectId: string }
  | { ok: false; reason: 'expo-go' | 'emulator' | 'no-project-id'; message: string };

const ExtraSchema = z.object({ eas: z.object({ projectId: z.string().min(1) }) });

/** Whether this build can receive remote pushes at all. */
export function pushSupport(): PushSupport {
  if (isRunningInExpoGo()) {
    return {
      ok: false,
      reason: 'expo-go',
      message:
        'Expo Go cannot receive push notifications. Install the development build (docs/setup-push.md).',
    };
  }
  if (!Device.isDevice) {
    return {
      ok: false,
      reason: 'emulator',
      message: 'Push notifications need a real Android phone.',
    };
  }
  const extra = ExtraSchema.safeParse(Constants.expoConfig?.extra);
  const projectId = extra.success ? extra.data.eas.projectId : Constants.easConfig?.projectId;
  if (!projectId) {
    return {
      ok: false,
      reason: 'no-project-id',
      message: 'EAS project id missing: run `eas init` and set EAS_PROJECT_ID in app.config.ts.',
    };
  }
  return { ok: true, projectId };
}

/**
 * The "Greenhouse alerts" channel: high importance (heads-up banner), sound,
 * vibration, visible on the lock screen. On Android 13+ a channel must exist
 * before the permission dialog can be shown. Safe to call repeatedly; works in
 * Expo Go too (local notifications).
 */
export async function ensureAlertChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
    name: 'Greenhouse alerts',
    description: 'Temperature, humidity, soil and light out of range, greenhouse offline',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 250, 200, 250],
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    showBadge: true,
  });
}

/**
 * While the app is open, alerts already show as an in-app toast (socket), so a
 * push that arrives in the foreground goes to the notification list silently.
 */
export function configureForegroundPresentation(): void {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
  });
}

function toPermissionState(p: Notifications.NotificationPermissionsStatus): PermissionState {
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'ask' : 'blocked';
}

export async function refreshPermission(): Promise<PermissionState> {
  const state = toPermissionState(await Notifications.getPermissionsAsync());
  useNotificationStore.getState().setPermission(state);
  return state;
}

/** Shows Android's POST_NOTIFICATIONS dialog (Android 13+). Call after explaining why. */
export async function requestPermission(): Promise<PermissionState> {
  await ensureAlertChannel();
  const state = toPermissionState(await Notifications.requestPermissionsAsync());
  useNotificationStore.getState().setPermission(state);
  return state;
}

/**
 * Gets the Expo push token and registers it with the backend at `server`.
 * Gracefully does nothing in Expo Go / on an emulator / without permission.
 * Also unregisters the previous token or server, if that changed.
 */
export async function registerForPush(server: string): Promise<void> {
  const store = useNotificationStore.getState();
  const support = pushSupport();
  if (!support.ok) {
    store.setRegistration('unsupported', support.message);
    return;
  }
  if ((await refreshPermission()) !== 'granted') {
    store.setRegistration('idle');
    return;
  }

  store.setRegistration('registering');
  try {
    await ensureAlertChannel();
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: support.projectId,
    });
    await api.registerPushToken(token);

    const { token: oldToken, registeredWith: oldServer } = useNotificationStore.getState();
    if (oldToken && oldServer && (oldToken !== token || oldServer !== server)) {
      // Best effort: the old server stops pushing to the old token.
      api.unregisterPushToken(oldToken, oldServer).catch(() => undefined);
    }
    useNotificationStore.getState().setRegistered(token, server);
  } catch (err) {
    useNotificationStore.getState().setRegistration('error', describeError(err));
  }
}
