// button-check-ignore: pressable alert *rows* inside a card (rounded icon tiles), not buttons
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Divider, IconTile, SectionHeader, Skeleton, Text } from '@/components/ui';
import { useAlertsQuery } from '@/features/alerts/queries';
import { alertTitle, alertVisual } from '@/features/alerts/presentation';
import { useTheme } from '@/theme';
import type { Alert } from '@/types/api';
import { formatRelative, formatRelativeSpoken, useNow } from '@/utils/time';

const SHOWN = 3;

/** "ACTIVITY / Recent alerts · View all": the newest 3 alerts; tapping opens the Alerts tab. */
export const RecentAlerts = memo(function RecentAlerts() {
  const query = useAlertsQuery('all');
  const now = useNow(30_000);
  const alerts = query.data?.pages[0]?.items.slice(0, SHOWN) ?? [];
  const openAlerts = () => router.push('/alerts');

  return (
    <View style={styles.section}>
      <SectionHeader
        eyebrow="Activity"
        title="Recent alerts"
        right={<Button label="View all" variant="ghost" size="small" onPress={openAlerts} />}
      />
      <Card padded={false}>
        {query.isPending ? (
          <View style={styles.loading} accessibilityLabel="Loading alerts">
            <Skeleton height={40} />
            <Skeleton height={40} />
          </View>
        ) : alerts.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="caption" color="secondary">
              {query.isError
                ? 'Alerts are unavailable right now.'
                : 'No alerts yet. Your greenhouse is happy.'}
            </Text>
          </View>
        ) : (
          alerts.map((alert, i) => (
            <View key={alert.id}>
              {i > 0 ? <Divider style={styles.divider} /> : null}
              <AlertLine alert={alert} now={now} onPress={openAlerts} />
            </View>
          ))
        )}
      </Card>
    </View>
  );
});

function AlertLine({ alert, now, onPress }: { alert: Alert; now: number; onPress: () => void }) {
  const theme = useTheme();
  const v = alertVisual(alert);
  const title = alertTitle(alert);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${alert.message}. ${formatRelativeSpoken(alert.ts, now)}${alert.readAt ? '' : ', unread'}`}
      accessibilityHint="Opens the alerts list"
      android_ripple={{ color: theme.colors.surfaceMuted }}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <IconTile icon={v.icon} tone={v.tone} size={36} />
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {alert.message}
        </Text>
      </View>
      <Text variant="micro" color="tertiary">
        {formatRelative(alert.ts, now)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  loading: { padding: 16, gap: 12 },
  empty: { padding: 16 },
  divider: { marginHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 64,
    paddingVertical: 10,
  },
  text: { flex: 1, gap: 2 },
  pressed: { opacity: 0.85 },
});
