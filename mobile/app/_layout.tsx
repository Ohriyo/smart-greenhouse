import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { ToastProvider } from '@/components/ui';
import { ApiError } from '@/services/api';
import { RealtimeBridge } from '@/services/realtime/RealtimeBridge';
import { useTheme } from '@/theme';

// React Native has no window focus: treat "app came to the foreground" as focus,
// so stale queries refetch when you reopen the app.
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
  return () => sub.remove();
});

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000, // socket events keep the live data fresh in between
        // Retry once for network hiccups; never retry 4xx or schema mismatches.
        retry: (failureCount, error) =>
          failureCount < 1 &&
          (!(error instanceof ApiError) || error.kind === 'network' || error.kind === 'timeout'),
      },
    },
  });
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const theme = useTheme();
  const { colors } = theme;

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

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeBridge />
      <ThemeProvider value={navTheme}>
        <ToastProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
