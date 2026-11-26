import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ServerWaking } from '@/components/greenhouse';
import { Card, EmptyState, ErrorState, Screen, Skeleton } from '@/components/ui';
import { CalibrationCard } from '@/features/control/CalibrationCard';
import { ThresholdsSection } from '@/features/control/ThresholdsSection';
import { LiveBanner } from '@/features/dashboard/LiveBanner';
import { useDevicesQuery, useLatestQuery, useThresholdsQuery } from '@/features/dashboard/queries';
import { describeError, errorTitle } from '@/services/api';
import { useLiveStore } from '@/store/liveStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme';

/** Control: sensor alert limits and soil calibration. */
export default function ControlScreen() {
  const theme = useTheme();
  const apiUrl = useSettingsStore((s) => s.apiUrl);
  const hydrated = useSettingsStore((s) => s.hydrated);

  const devicesQuery = useDevicesQuery();
  const deviceId = useLiveStore((s) => s.deviceIds[0]);
  const latestQuery = useLatestQuery(deviceId);
  const thresholdsQuery = useThresholdsQuery(deviceId);

  const [refreshing, setRefreshing] = useState(false);
  const { refetch: refetchDevices } = devicesQuery;
  const { refetch: refetchLatest } = latestQuery;
  const { refetch: refetchThresholds } = thresholdsQuery;
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([refetchDevices(), refetchLatest(), refetchThresholds()]);
    setRefreshing(false);
  }, [refetchDevices, refetchLatest, refetchThresholds]);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      colors={[theme.colors.accent]}
      progressBackgroundColor={theme.colors.surface}
    />
  );

  if (hydrated && !apiUrl) {
    return (
      <Screen title="Control" subtitle="Not connected">
        <EmptyState
          icon="server-outline"
          title="No server address"
          message="This build has no server address. Set EXPO_PUBLIC_API_URL and build the app again."
        />
      </Screen>
    );
  }

  if (!deviceId) {
    if (devicesQuery.isError && !devicesQuery.isFetching) {
      return (
        <Screen
          title="Control"
          subtitle="Alert limits and soil calibration"
          refreshControl={refreshControl}
        >
          <ErrorState
            title={errorTitle(devicesQuery.error)}
            message={describeError(devicesQuery.error)}
            onRetry={() => void onRefresh()}
            retrying={refreshing}
          />
        </Screen>
      );
    }
    if (devicesQuery.isSuccess && devicesQuery.data.length === 0) {
      return (
        <Screen
          title="Control"
          subtitle="Alert limits and soil calibration"
          refreshControl={refreshControl}
        >
          <EmptyState
            icon="leaf-outline"
            title="No greenhouse yet"
            message="Power on the ESP32. The greenhouse appears here after its first reading."
            action={{ label: 'Refresh', onPress: () => void onRefresh() }}
          />
        </Screen>
      );
    }
    return (
      <Screen title="Control" subtitle="Alert limits and soil calibration">
        <ServerWaking loading />
        <LoadingCards />
      </Screen>
    );
  }

  return (
    <Screen
      title="Control"
      subtitle="Alert limits and soil calibration"
      banner={
        <LiveBanner deviceId={deviceId} restFailed={devicesQuery.isError || latestQuery.isError} />
      }
      refreshControl={refreshControl}
    >
      {thresholdsQuery.data ? (
        <ThresholdsSection deviceId={deviceId} saved={thresholdsQuery.data} />
      ) : thresholdsQuery.isError ? (
        <Card>
          <ErrorState
            title="Couldn't load thresholds"
            message={describeError(thresholdsQuery.error)}
            onRetry={() => void refetchThresholds()}
            retrying={thresholdsQuery.isFetching}
          />
        </Card>
      ) : (
        <Skeleton height={320} radius={theme.radii.lg} />
      )}

      <CalibrationCard deviceId={deviceId} />
    </Screen>
  );
}

function LoadingCards() {
  const theme = useTheme();
  return (
    <View accessible accessibilityLabel="Loading" style={styles.loading}>
      <Skeleton height={320} radius={theme.radii.lg} />
      <Skeleton height={220} radius={theme.radii.lg} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { gap: 16 },
});
