import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  AlertRow,
  ConnectionBanner,
  FanStatusCard,
  SensorCard,
  type ConnectionState,
} from '@/components/greenhouse';
import { Button, Card, ErrorState, Screen, Skeleton, StatusPill, Text } from '@/components/ui';
import { mockDevice, mockOfflineLastSeen, mockReading, mockThresholds } from '@/constants/mock';
import { useMockStore } from '@/store/mockStore';
import { useTheme } from '@/theme';
import type { AlertMetric } from '@/types/api';
import { limitsFor, sensorStatus } from '@/utils/sensors';
import { formatRelative, useNow } from '@/utils/time';

const METRIC_ORDER: AlertMetric[] = ['airTemp', 'humidity', 'soilMoisture', 'lux'];
/** Below this width the sensor grid uses one column (small phones, large font). */
const ONE_COLUMN_BELOW = 360;

export default function DashboardScreen() {
  const theme = useTheme();
  const now = useNow();
  const { width, fontScale } = useWindowDimensions();
  const scenario = useMockStore((s) => s.scenario);
  const alerts = useMockStore((s) => s.alerts);
  const markRead = useMockStore((s) => s.markRead);
  const [retrying, setRetrying] = useState(false);

  const online = scenario !== 'offline';
  const lastSeen = online ? mockDevice.lastSeen : mockOfflineLastSeen;
  const connection: ConnectionState =
    scenario === 'offline'
      ? 'device-offline'
      : scenario === 'error'
        ? 'backend-unreachable'
        : 'connected';
  const columns = width < ONE_COLUMN_BELOW || fontScale > 1.3 ? 1 : 2;

  const header = {
    title: mockDevice.name,
    subtitle: online ? `Live · updated ${formatRelative(lastSeen, now)}` : 'No live data',
    headerRight: online ? (
      <StatusPill tone="ok" label="Online" accessibilityLabel="Device online" />
    ) : (
      <StatusPill tone="offline" label="Offline" accessibilityLabel="Device offline" />
    ),
  };

  if (scenario === 'loading') {
    return (
      <Screen {...header} subtitle="Loading…">
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

  if (scenario === 'error') {
    return (
      <Screen {...header} subtitle="Connection problem">
        <ErrorState
          title="Can't load the greenhouse"
          message="The app couldn't reach the backend on your laptop. Check that it is running and that the phone is on the same Wi-Fi."
          retrying={retrying}
          onRetry={() => {
            setRetrying(true);
            setTimeout(() => setRetrying(false), 1200);
          }}
        />
      </Screen>
    );
  }

  const recent = alerts.slice(0, 3);
  const unread = alerts.filter((a) => a.readAt === null).length;

  return (
    <Screen
      {...header}
      banner={<ConnectionBanner state={connection} lastSeen={lastSeen} now={now} />}
    >
      <Grid columns={columns} gap={theme.spacing.md}>
        {METRIC_ORDER.map((metric) => {
          const [min, max] = limitsFor(metric, mockThresholds);
          const value = mockReading[metric];
          return (
            <SensorCard
              key={metric}
              metric={metric}
              value={value}
              min={min}
              max={max}
              status={sensorStatus(metric, value, min, max, online)}
              updatedAt={lastSeen}
              now={now}
              onPress={() => router.push({ pathname: '/history', params: { metric } })}
            />
          );
        })}
      </Grid>

      <FanStatusCard
        fanOn={mockReading.fanOn}
        fanMode={mockReading.fanMode}
        fanOnTemp={mockThresholds.fanOnTemp}
        fanOffTemp={mockThresholds.fanOffTemp}
        deviceOnline={online}
        onPress={() => router.push('/control')}
      />

      <Card>
        <View style={styles.sectionHeader}>
          <Text variant="heading" accessibilityRole="header">
            Recent alerts
          </Text>
          {unread > 0 ? <StatusPill tone="danger" label={`${unread} new`} /> : null}
        </View>
        {recent.length === 0 ? (
          <Text color="secondary">No alerts. Everything is within range.</Text>
        ) : (
          recent.map((a, i) => (
            <View
              key={a.id}
              style={
                i > 0
                  ? {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.colors.border,
                    }
                  : null
              }
            >
              <AlertRow alert={a} now={now} onPress={markRead} />
            </View>
          ))
        )}
        <Button
          label="See all alerts"
          variant="ghost"
          icon="chevron-forward"
          onPress={() => router.push('/alerts')}
        />
      </Card>
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
});
