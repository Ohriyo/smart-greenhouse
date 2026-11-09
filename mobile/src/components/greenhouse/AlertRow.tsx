import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, type IconName } from '@/components/ui';
import { toneColors, useTheme, type StatusTone } from '@/theme';
import type { Alert } from '@/types/api';
import { formatDateTime, formatRelative, formatRelativeSpoken } from '@/utils/time';

interface AlertRowProps {
  alert: Alert;
  now: number;
  onPress?: (id: number) => void;
}

function visual(alert: Alert): { tone: StatusTone; icon: IconName; label: string } {
  switch (alert.type) {
    case 'recovered':
      return { tone: 'ok', icon: 'checkmark-circle', label: 'Recovered' };
    case 'online':
      return { tone: 'ok', icon: 'wifi', label: 'Online' };
    case 'offline':
      return { tone: 'offline', icon: 'cloud-offline', label: 'Offline' };
    case 'above_max':
    case 'below_min':
      return alert.severity === 'critical'
        ? { tone: 'danger', icon: 'alert-circle', label: 'Critical' }
        : { tone: 'warning', icon: 'warning', label: 'Warning' };
  }
}

export const AlertRow = memo(function AlertRow({ alert, now, onPress }: AlertRowProps) {
  const theme = useTheme();
  const v = visual(alert);
  const { fg, bg } = toneColors(theme, v.tone);
  const unread = alert.readAt === null;

  return (
    <Pressable
      onPress={onPress ? () => onPress(alert.id) : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${v.label}. ${alert.message}. ${formatRelativeSpoken(alert.ts, now)}`}
      accessibilityHint={onPress && unread ? 'Marks the alert as read' : undefined}
      android_ripple={{ color: theme.colors.surfaceMuted }}
      style={({ pressed }) => [styles.row, pressed ? { opacity: 0.85 } : null]}
    >
      <View
        style={[styles.icon, { backgroundColor: bg }]}
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons name={v.icon} size={20} color={fg} />
      </View>
      <View style={styles.body} importantForAccessibility="no-hide-descendants">
        <Text variant={unread ? 'bodyStrong' : 'body'} numberOfLines={2}>
          {alert.message}
        </Text>
        <Text variant="caption" color="tertiary">
          {v.label} · {formatRelative(alert.ts, now)} · {formatDateTime(alert.ts)}
        </Text>
      </View>
      {unread ? (
        <View
          style={[styles.unreadDot, { backgroundColor: theme.colors.accent }]}
          importantForAccessibility="no"
        />
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 10,
  },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  unreadDot: { width: 10, height: 10, borderRadius: 5 },
});
