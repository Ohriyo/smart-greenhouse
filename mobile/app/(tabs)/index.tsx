import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  ConnectionBanner,
  LiveFanCard,
  LiveSensorCard,
  UpdatedAgo,
  type ConnectionState,
} from '@/components/greenhouse';
import { Card, EmptyState, ErrorState, Screen, Skeleton, StatusPill } from '@/components/ui';
import { useDevicesQuery, useLatestQuery, useThresholdsQuery } from '@/features/dashboard/queries';
import { useConnectionState } from '@/features/dashboard/useConnectionState';
import { describeError } from '@/services/api';
import { useLiveStore } from '@/store/liveStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme, type StatusTone } from '@/theme';
import type { AlertMetric } from '@/types/api';
import { limitsFor } from '@/utils/sensors';

const METRIC_ORDER: AlertMetric[] = ['airTemp', 'humidity', 'soilMoisture', 'lux'];
/** Below this width the sensor grid uses one column (small phones, large font). */
const ONE_COLUMN_BELOW = 360;

const PILL: Record<ConnectionState, { tone: StatusTone; label: string; spoken: string }> = {
  connected: { tone: 'ok', label: 'Live', spoken: 'Live, device online' },
  connecting: { tone: 'neutral', label: 'Connecting', spoken: 'Connecting' },
  reconnecting: { tone: 'warning', label: 'Reconnecting', spoken: 'Reconnecting' },
  'backend-unreachable': { tone: 'danger', label: 'No server', spoken: 'Server unreachable' },
  'device-offline': { tone: 'offline', label: 'Offline', spoken: 'Device offline' },
};

export default function DashboardScreen() {
  const theme = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const columns = width < ONE_COLUMN_BELOW || fontScale > 1.3 ? 1 : 2;

  const apiUrl = useSettingsStore((s) => s.apiUrl);
  const hydrated = useSettingsStore((s) => s.hydrated);

  const devicesQuery = useDevicesQuery();
  // Single-greenhouse app: show the first device (sorted by id).
  const deviceId = useLiveStore((s) => s.deviceIds[0]);
  const deviceName = useLiveStore((s) => (deviceId ? s.devices[deviceId]?.name : undefined));
  const lastSeen = useLiveStore((s) => (deviceId ? s.devices[deviceId]?.lastSeen : null) ?? null);
  const hasReading = useLiveStore((s) => (deviceId ? !!s.readings[deviceId] : false));
  const latestQuery = useLatestQuery(deviceId);
  const thresholdsQuery = useThresholdsQuery(deviceId);
  const thresholds = thresholdsQuery.data;

  const connection = useConnectionState(deviceId, devicesQuery.isError || latestQuery.isError);

  const [refreshing, setRefreshing] = useState(false);
  const { refetch: refetchDevices } = devicesQuery;
  const { refetch: refetchLatest } = latestQuery;
  const { refetch: refetchThresholds } = thresholdsQuery;
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([refetchDevices(), refetchLatest(), refetchThresholds()]);
    setRefreshing(false);
  }, [refetchDevices, refetchLatest, refetchThresholds]);

  // Stable callbacks keep the memoized cards from re-rendering.
  const openHistory = useCallback(
    (metric: AlertMetric) => router.push({ pathname: '/history', params: { metric } }),
    [],
  );
  const openControl = useCallback(() => router.push('/control'), []);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      colors={[theme.colors.accent]}
      progressBackgroundColor={theme.colors.surface}
    />
  );
  const pill = PILL[connection];
  const headerRight = (
    <StatusPill tone={pill.tone} label={pill.label} accessibilityLabel={pill.spoken} />
  );

  // --- No server configured ---
  if (hydrated && !apiUrl) {
    return (
      <Screen title="Greenhouse" subtitle="Not connected">
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
        <Screen title="Greenhouse" headerRight={headerRight} refreshControl={refreshControl}>
          <ErrorState
            title="Can't reach the server"
            message={describeError(devicesQuery.error)}
            onRetry={() => void onRefresh()}
            retrying={refreshing}
          />
        </Screen>
      );
    }
    if (devicesQuery.isSuccess && devicesQuery.data.length === 0) {
      return (
        <Screen title="Greenhouse" headerRight={headerRight} refreshControl={refreshControl}>
          <EmptyState
            icon="leaf-outline"
            title="No greenhouse yet"
            message="Power on the ESP32 or start the simulator (npm run sim in backend/). It appears here automatically."
            action={{ label: 'Refresh', onPress: () => void onRefresh() }}
          />
        </Screen>
      );
    }
    return <LoadingDashboard columns={columns} headerRight={headerRight} />;
  }

  if (!hasReading && latestQuery.isPending) {
    return <LoadingDashboard columns={columns} headerRight={headerRight} title={deviceName} />;
  }

  return (
    <Screen
      title={deviceName ?? 'Greenhouse'}
      subtitle={
        hasReading ? (
          <UpdatedAgo
            deviceId={deviceId}
            prefix={connection === 'connected' ? 'Live · updated' : 'Last data'}
            color="secondary"
          />
        ) : (
          'Waiting for the first reading'
        )
      }
      headerRight={headerRight}
      banner={<ConnectionBanner state={connection} lastSeen={lastSeen} />}
      refreshControl={refreshControl}
    >
      <Grid columns={columns} gap={theme.spacing.md}>
        {METRIC_ORDER.map((metric) => {
          const [min, max] = thresholds ? limitsFor(metric, thresholds) : [null, null];
          return (
            <LiveSensorCard
              key={metric}
              deviceId={deviceId}
              metric={metric}
              min={min}
              max={max}
              onPress={openHistory}
            />
          );
        })}
      </Grid>

      <LiveFanCard
        deviceId={deviceId}
        fanOnTemp={thresholds?.fanOnTemp ?? 32}
        fanOffTemp={thresholds?.fanOffTemp ?? 28}
        onPress={openControl}
      />
    </Screen>
  );
}

function LoadingDashboard({
  columns,
  headerRight,
  title = 'Greenhouse',
}: {
  columns: number;
  headerRight: ReactNode;
  title?: string;
}) {
  const theme = useTheme();
  return (
    <Screen title={title} subtitle="Loading…" headerRight={headerRight}>
      <View accessible accessibilityLabel="Loading greenhouse data" style={styles.loading}>
        <Grid columns={columns} gap={theme.spacing.md}>
          {METRIC_ORDER.map((m) => (
            <Card key={m} style={styles.skeletonCard}>
              <Skeleton width={36} height={36} radius={18} />
              <Skeleton width="60%" height={14} />
              <Skeleton width="80%" height={30} />
            </Card>
          ))}
        </Grid>
        <Skeleton height={88} radius={theme.radii.lg} />
      </View>
    </Screen>
  );
}

/** Simple responsive grid: `columns` cards per row with equal widths. */
function Grid({ columns, gap, children }: { columns: number; gap: number; children: ReactNode[] }) {
  const rows: ReactNode[][] = [];
  for (let i = 0; i < children.length; i += columns) rows.push(children.slice(i, i + columns));
  return (
    <View style={{ gap }}>
      {rows.map((row, r) => (
        <View key={r} style={[styles.gridRow, { gap }]}>
          {row}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { gap: 16 },
  skeletonCard: { flex: 1, gap: 12 },
  gridRow: { flexDirection: 'row' },
});
