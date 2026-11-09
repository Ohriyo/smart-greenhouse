import { useQueryClient, type Query } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useToast, type ToastTone } from '@/components/ui';
import { alertTitle } from '@/features/alerts/presentation';
import { useLiveStore } from '@/store/liveStore';
import { useNetworkStore } from '@/store/networkStore';
import { useRecentStore } from '@/store/recentStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Alert } from '@/types/api';

import { connectRealtime, pauseRealtime, resumeRealtime, retryRealtimeNow } from './socket';

/** Toast color: red for critical, amber for warnings, green for recoveries, blue for info. */
function toastTone(alert: Alert): ToastTone {
  if (alert.type === 'recovered' || alert.type === 'online') return 'success';
  return alert.severity === 'critical'
    ? 'error'
    : alert.severity === 'warning'
      ? 'warning'
      : 'info';
}

/** What may have changed while we weren't listening (contract §3: events aren't replayed). */
const REFETCH_ON_RECONNECT = new Set(['devices', 'latest', 'alerts', 'thresholds', 'recent']);
const isLiveQuery = (q: Query) =>
  typeof q.queryKey[0] === 'string' && REFETCH_ON_RECONNECT.has(q.queryKey[0]);

/**
 * Owns the one app-wide socket. Renders nothing; must be inside <ToastProvider>.
 * - connects to the saved server (live data of another server is cleared)
 * - pauses while the app is in the background or the phone is offline, and
 *   resumes immediately when it's back (no waiting for the backoff timer)
 * - retries right away when the network changes (e.g. back on home Wi-Fi)
 * - after every (re)connect refetches the latest readings, devices and alerts
 * - new alerts: toast + refresh of the alert list and badge
 */
export function RealtimeBridge() {
  const apiUrl = useSettingsStore((s) => s.apiUrl);
  const settingsHydrated = useSettingsStore((s) => s.hydrated);
  const liveHydrated = useLiveStore((s) => s.hydrated);
  const phoneOnline = useNetworkStore((s) => s.connected !== false);
  const network = useNetworkStore((s) => `${s.type}|${s.ipAddress ?? ''}`);
  const queryClient = useQueryClient();
  const toast = useToast();

  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!settingsHydrated || !liveHydrated) return;
    // Another server's live chart data must never be shown.
    if (useLiveStore.getState().serverUrl !== apiUrl) useRecentStore.getState().clear();
    useLiveStore.getState().switchServer(apiUrl);
    if (!apiUrl) return;
    return connectRealtime(apiUrl, {
      onConnect: () => void queryClient.invalidateQueries({ predicate: isLiveQuery }),
      onAlert: (alert) => {
        void queryClient.invalidateQueries({ queryKey: ['alerts', apiUrl] });
        // Slides in from the top; a tap opens the Alerts tab.
        toast.show(alert.message, toastTone(alert), {
          title: alertTitle(alert),
          onPress: () => router.push('/alerts'),
        });
      },
    });
  }, [apiUrl, settingsHydrated, liveHydrated, queryClient, toast]);

  const active = foreground && phoneOnline;
  useEffect(() => {
    if (active) resumeRealtime();
    else pauseRealtime();
    // apiUrl: a new socket starts unpaused; pause it again if needed.
  }, [active, apiUrl, liveHydrated]);

  useEffect(() => {
    if (active) retryRealtimeNow();
  }, [network, active]);

  return null;
}
