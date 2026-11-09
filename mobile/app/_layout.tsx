import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ToastProvider } from '@/components/ui';
import { startNetworkMonitoring } from '@/services/network';
import {
  configureForegroundPresentation,
  NotificationsBridge,
  useNotificationTap,
} from '@/services/notifications';
import { createQueryClient, persistOptions } from '@/services/queryClient';
import { RealtimeBridge } from '@/services/realtime/RealtimeBridge';
import { useTheme } from '@/theme';

// DEV ONLY: the "Demo" button + "Presentation tools" sheet. The condition is written out
// here (not imported) so Metro can fold it at build time: in a normal release build this
// is `null` and the Demo code is not in the bundle. Enabled in development builds, or
// in a build made with EXPO_PUBLIC_DEMO=1.
const DemoOverlay =
  __DEV__ || process.env.EXPO_PUBLIC_DEMO === '1' ? lazy(() => import('@/dev/DemoOverlay')) : null;

// Crashes while rendering show a friendly screen with "Reload" (Expo Router
// wraps this layout with it).
export { RootErrorBoundary as ErrorBoundary } from '@/components/RootErrorBoundary';

// As early as possible (module load):
configureForegroundPresentation(); // how pushes look while the app is open
startNetworkMonitoring(); // NetInfo → network store + TanStack onlineManager

// React Native has no window focus: treat "app came to the foreground" as focus,
// so stale queries refetch when you reopen the app.
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
  return () => sub.remove();
});

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const theme = useTheme();
  const { colors } = theme;
  // Inter (one family per weight on Android). If loading fails we still render
  // with the system font rather than a blank screen.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  // Notification tap → Alerts tab (also when the tap launched the app).
  useNotificationTap(queryClient);

  // Window background behind all views: avoids a white flash in dark mode
  // during screen transitions and behind the edge-to-edge system bars.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  const navTheme = useMemo(() => {
    const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    };
  }, [theme.scheme, colors]);

  if (!fontsLoaded && !fontError) return null;

  return (
    // Restores the saved query cache (thresholds, alerts, …) before queries run,
    // so a cold start without connection still shows the last known data.
    <GestureHandlerRootView style={styles.root}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <ThemeProvider value={navTheme}>
          <ToastProvider>
            <RealtimeBridge />
            <NotificationsBridge />
            {/* Follows the in-app theme choice (Light / Dark / System), not only the phone. */}
            <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="sensor/[metric]" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="dev-gallery" options={{ animation: 'slide_from_right' }} />
            </Stack>
            {DemoOverlay ? (
              <Suspense fallback={null}>
                <DemoOverlay />
              </Suspense>
            ) : null}
          </ToastProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
