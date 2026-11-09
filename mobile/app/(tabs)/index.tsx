import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { Card, EmptyState, ErrorState, Eyebrow, Screen, Skeleton, Text } from '@/components/ui';
import { useAlertsQuery } from '@/features/alerts/queries';
import { HealthRanges } from '@/features/dashboard/HealthRanges';
import { HomeFanCard } from '@/features/dashboard/HomeFanCard';
import { HomeHeader } from '@/features/dashboard/HomeHeader';
import { LiveBanner } from '@/features/dashboard/LiveBanner';
import { LiveConditions } from '@/features/dashboard/LiveConditions';
import { LiveTrend } from '@/features/dashboard/LiveTrend';
import {
  useDevicesQuery,
  useLatestQuery,
  useRecentQuery,
  useThresholdsQuery,
} from '@/features/dashboard/queries';
import { LiveStatusCard } from '@/features/dashboard/LiveStatusCard';
import { RecentAlerts } from '@/features/dashboard/RecentAlerts';
import { useConnectionState } from '@/features/dashboard/useConnectionState';
import { useDeviceOnline } from '@/features/dashboard/useLiveness';
import { describeError, errorTitle } from '@/services/api';
import { useLiveStore } from '@/store/liveStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme';

/** Home: header, status, live conditions, health ranges, live trend, fan, recent alerts. */
export default function HomeScreen() {
  const theme = useTheme();
  const apiUrl = useSettingsStore((s) => s.apiUrl);
  const hydrated = useSettingsStore((s) => s.hydrated);

  const devicesQuery = useDevicesQuery();
  // Single-greenhouse app: the first device (sorted by id).
  const deviceId = useLiveStore((s) => s.deviceIds[0]);
  const deviceName = useLiveStore((s) => (deviceId ? s.devices[deviceId]?.name : undefined));
  const deviceOnline = useDeviceOnline(deviceId);
  // A boolean, not the reading itself: this screen must not re-render on every telemetry
  // message (the cards that show values subscribe to them on their own).
  const hasReading = useLiveStore((s) => (deviceId ? !!s.readings[deviceId] : false));

  const latestQuery = useLatestQuery(deviceId);
  const thresholdsQuery = useThresholdsQuery(deviceId);
  const recentQuery = useRecentQuery(deviceId);
  const alertsQuery = useAlertsQuery('all');
  const thresholds = thresholdsQuery.data;

  const restFailed = devicesQuery.isError || latestQuery.isError;
  const connection = useConnectionState(deviceId, restFailed);

  const [refreshing, setRefreshing] = useState(false);
  const { refetch: refetchDevices } = devicesQuery;
  const { refetch: refetchLatest } = latestQuery;
  const { refetch: refetchThresholds } = thresholdsQuery;
  const { refetch: refetchRecent } = recentQuery;
  const { refetch: refetchAlerts } = alertsQuery;
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      refetchDevices(),
      refetchLatest(),
      refetchThresholds(),
      refetchRecent(),
      refetchAlerts(),
    ]);
    setRefreshing(false);
  }, [refetchDevices, refetchLatest, refetchThresholds, refetchRecent, refetchAlerts]);
  const refresh = useCallback(() => void onRefresh(), [onRefresh]);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={refresh}
      colors={[theme.colors.accent]}
      progressBackgroundColor={theme.colors.surface}
    />
  );

  // --- No server configured ---
  if (hydrated && !apiUrl) {
    return (
      <Screen title="ETanim" subtitle="Not connected">
        <EmptyState
          icon="server-outline"
          title="Set your server address"
          message="Enter your laptop's address (e.g. http://192.168.1.50:4000) in Settings."
          action={{ label: 'Open Settings', onPress: () => router.push('/settings') }}
        />
      </Screen>
    );
  }

  // --- No device yet ---
  if (!deviceId) {
    if (devicesQuery.isError && !devicesQuery.isFetching) {
      return (
        <Screen title="ETanim" subtitle="My greenhouse" refreshControl={refreshControl}>
          <ErrorState
            title={errorTitle(devicesQuery.error)}
            message={describeError(devicesQuery.error)}
            onRetry={refresh}
            retrying={refreshing}
          />
        </Screen>
      );
    }
    if (devicesQuery.isSuccess && devicesQuery.data.length === 0) {
      return (
        <Screen title="ETanim" subtitle="My greenhouse" refreshControl={refreshControl}>
          <EmptyState
            icon="leaf-outline"
            title="No greenhouse yet"
            message="Power on the ESP32 or start the simulator (npm run sim in backend/). It appears here automatically."
            action={{ label: 'Refresh', onPress: refresh }}
          />
        </Screen>
      );
    }
    return <HomeSkeleton />;
  }

  if (!hasReading && latestQuery.isPending) return <HomeSkeleton title={deviceName} />;

  return (
    <Screen
      title={deviceName ?? 'Greenhouse'}
      header={
        <HomeHeader
          deviceId={deviceId}
          deviceName={deviceName ?? deviceId}
          connection={connection}
          deviceOnline={deviceOnline}
          onRefresh={refresh}
          refreshing={refreshing}
        />
      }
      banner={<LiveBanner deviceId={deviceId} restFailed={restFailed} />}
      refreshControl={refreshControl}
    >
      <LiveStatusCard deviceId={deviceId} thresholds={thresholds} />
      <LiveConditions deviceId={deviceId} thresholds={thresholds} />
      <HealthRanges deviceId={deviceId} thresholds={thresholds} />
      <LiveTrend deviceId={deviceId} fanOnTemp={thresholds?.fanOnTemp ?? 32} />
      <HomeFanCard deviceId={deviceId} />
      <RecentAlerts />
    </Screen>
  );
}

/** Skeleton in the shape of the real screen (status card, 2×2 cards, a chart). */
function HomeSkeleton({ title }: { title?: string }) {
  const theme = useTheme();
  return (
    <Screen
      title={title ?? 'Greenhouse'}
      header={
        <View style={styles.headerSkeleton}>
          <Eyebrow>My greenhouse</Eyebrow>
          <Text variant="title">{title ?? 'Loading…'}</Text>
        </View>
      }
    >
      <View accessible accessibilityLabel="Loading greenhouse data" style={styles.loading}>
        <Skeleton height={120} radius={theme.radii.lg} />
        <View style={styles.row}>
          {[0, 1].map((i) => (
            <Card key={i} style={styles.flex}>
              <Skeleton width={36} height={36} radius={10} />
              <Skeleton width="60%" height={12} />
              <Skeleton width="70%" height={32} />
            </Card>
          ))}
        </View>
        <View style={styles.row}>
          {[0, 1].map((i) => (
            <Card key={i} style={styles.flex}>
              <Skeleton width={36} height={36} radius={10} />
              <Skeleton width="60%" height={12} />
              <Skeleton width="70%" height={32} />
            </Card>
          ))}
        </View>
        <Skeleton height={200} radius={theme.radii.lg} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerSkeleton: { gap: 4 },
  loading: { gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1, gap: 12 },
});
