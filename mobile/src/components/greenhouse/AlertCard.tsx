import { memo, useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Card, Icon, IconTile, Text } from '@/components/ui';
import { alertAccent, alertDetail, alertTitle, alertVisual } from '@/features/alerts/presentation';
import { MANILA_TZ } from '@/utils/manilaTime';
import { toneColors, useTheme } from '@/theme';
import type { Alert } from '@/types/api';
import { formatRelative, formatRelativeSpoken } from '@/utils/time';

interface AlertCardProps {
  alert: Alert;
  /** Current time (ms); the parent ticks it, so relative times stay fresh. */
  now: number;
  /** Receive the alert so the parent's callbacks stay stable (memoized rows). */
  onOpen: (alert: Alert) => void;
  onMarkRead: (alert: Alert) => void;
}

const MARK_READ_ACTION = [{ name: 'markRead', label: 'Mark as read' }] as const;

/**
 * Alert as a rounded card: colored icon tile, title with an unread dot, one-line
 * detail, "8 min ago · Asia/Manila", chevron. Warnings get an amber left edge,
 * critical a red one. Swipe right (or the TalkBack action) marks it read; a tap
 * opens the details.
 */
export const AlertCard = memo(function AlertCard({
  alert,
  now,
  onOpen,
  onMarkRead,
}: AlertCardProps) {
  const theme = useTheme();
  const { colors } = theme;
  const swipeRef = useRef<SwipeableMethods>(null);
  const unread = alert.readAt === null;
  const visual = alertVisual(alert);
  const accent = alertAccent(alert);
  const title = alertTitle(alert);
  const detail = alertDetail(alert);

  const markRead = useCallback(() => {
    onMarkRead(alert);
    swipeRef.current?.close();
  }, [alert, onMarkRead]);

  const card = (
    <Card
      onPress={() => onOpen(alert)}
      accentColor={accent ? toneColors(theme, accent).fg : undefined}
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${title}. ${detail}. ${formatRelativeSpoken(alert.ts, now)}`}
      accessibilityHint="Opens the alert details"
      accessibilityActions={unread ? MARK_READ_ACTION : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'markRead') markRead();
      }}
    >
      <View style={styles.row}>
        <IconTile icon={visual.icon} tone={visual.tone} size={44} />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text variant="heading" numberOfLines={1} style={styles.title}>
              {title}
            </Text>
            {unread ? (
              <View
                style={[styles.dot, { backgroundColor: colors.danger }]}
                importantForAccessibility="no"
              />
            ) : null}
          </View>
          <Text variant="caption" color="secondary" numberOfLines={2}>
            {detail}
          </Text>
          <Text variant="micro" color="secondary" style={styles.meta}>
            {formatRelative(alert.ts, now)} · {MANILA_TZ}
          </Text>
          {unread ? (
            <Text variant="micro" color="tertiary">
              Swipe to mark read
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>
    </Card>
  );

  // Read alerts have nothing to swipe for.
  if (!unread) return card;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1.6}
      leftThreshold={72}
      overshootLeft={false}
      onSwipeableOpen={markRead}
      renderLeftActions={() => (
        <View style={[styles.action, { backgroundColor: colors.accentSoft }]}>
          <Icon name="checkmark-done" size={22} color={colors.accent} />
          <Text variant="label" tint={colors.accent}>
            Mark read
          </Text>
        </View>
      )}
    >
      {card}
    </ReanimatedSwipeable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { marginTop: 4 },
  action: {
    width: 96,
    marginRight: 8,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
