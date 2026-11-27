import { StyleSheet, View } from 'react-native';

import {
  Card,
  Divider,
  ErrorState,
  Icon,
  ListRow,
  Skeleton,
  StatusPill,
  Text,
} from '@/components/ui';
import { smsStatusLabel } from '@/features/alerts/presentation';
import { useSmsStatus } from '@/features/sms/queries';
import { describeError } from '@/services/api';
import { useTheme, type StatusTone } from '@/theme';
import type { SmsAttempt, SmsStatusInfo } from '@/types/api';
import { formatRelative, formatRelativeSpoken, useNow } from '@/utils/time';

/** How many of the newest attempts are listed. */
const SHOWN_ATTEMPTS = 5;

/**
 * "SMS ALERTS": read-only. The numbers, dry-run mode and limits are set in the
 * server environment (ALERT_PHONE_NUMBERS, SMS_DRY_RUN, …); the SMS provider's
 * key never reaches the app.
 */
export function SmsSection() {
  const status = useSmsStatus();

  if (status.data) return <SmsCard info={status.data} />;
  return (
    <Card>
      {status.isError ? (
        <ErrorState
          title="Couldn't load SMS status"
          message={describeError(status.error)}
          onRetry={() => void status.refetch()}
          retrying={status.isFetching}
        />
      ) : (
        <View accessibilityLabel="Loading SMS status" style={styles.loading}>
          <Skeleton height={44} />
          <Skeleton height={60} />
        </View>
      )}
    </Card>
  );
}

function SmsCard({ info }: { info: SmsStatusInfo }) {
  const { colors } = useTheme();
  const now = useNow(15_000);
  const configured = info.recipients.length > 0;
  const mode: { tone: StatusTone; label: string } = !configured
    ? { tone: 'offline', label: 'Off' }
    : info.dryRun
      ? { tone: 'warning', label: 'Dry run' }
      : { tone: 'ok', label: 'On' };

  return (
    <Card>
      <ListRow
        title="SMS alerts"
        subtitle={
          configured
            ? `To ${info.recipients.join(', ')}`
            : 'No numbers set on the server (ALERT_PHONE_NUMBERS)'
        }
        icon="chatbubble-ellipses-outline"
        trailing={<StatusPill tone={mode.tone} label={mode.label} />}
      />

      {configured && info.dryRun ? (
        <View
          style={[styles.notice, { backgroundColor: colors.warningSoft }]}
          accessible
          accessibilityLabel="Dry run: every SMS is recorded on the server but not sent, and no credit is used. Set SMS_DRY_RUN to false on the server to send real SMS."
        >
          <Icon name="information-circle-outline" size={18} color={colors.warning} />
          <Text variant="caption" tint={colors.warning} style={styles.flex}>
            Dry run: every SMS is recorded on the server but not sent (SMS_DRY_RUN=true).
          </Text>
        </View>
      ) : null}

      <Text variant="caption" color="secondary" style={styles.rules}>
        A text for every threshold crossing, and one when the value is back to normal. The same
        sensor and condition at most every {info.cooldownMinutes} min, at most {info.dailyCap} a day
        ({info.sentLast24h} sent in the last 24 h). Offline after {info.offlineAfterMinutes} min
        without data.
      </Text>

      <Divider style={styles.divider} />
      <Text variant="eyebrow" color="secondary" style={styles.recentTitle}>
        Recent SMS
      </Text>
      {info.recent.length === 0 ? (
        <Text variant="caption" color="secondary">
          No SMS yet.
        </Text>
      ) : (
        info.recent
          .slice(0, SHOWN_ATTEMPTS)
          .map((attempt) => <AttemptRow key={attempt.id} attempt={attempt} now={now} />)
      )}

      <Text variant="micro" color="tertiary" style={styles.hint}>
        Set on the server. To send a test SMS before a demo, see the README (“Pre-demo checklist”).
      </Text>
    </Card>
  );
}

function AttemptRow({ attempt, now }: { attempt: SmsAttempt; now: number }) {
  const { colors } = useTheme();
  const label = smsStatusLabel(attempt.status);
  const problem = attempt.status === 'failed' ? attempt.providerResponse : null;
  return (
    <View
      style={styles.attempt}
      accessible
      accessibilityLabel={`${label.text}, ${formatRelativeSpoken(attempt.at, now)}. ${attempt.message}${problem ? `. ${problem}` : ''}`}
    >
      <View style={styles.attemptHead}>
        <StatusPill tone={label.tone} label={label.text} variant="plain" />
        <Text variant="micro" color="tertiary">
          {formatRelative(attempt.at, now)}
        </Text>
      </View>
      <Text variant="caption" numberOfLines={2}>
        {attempt.message}
      </Text>
      {problem ? (
        <Text variant="micro" tint={colors.danger} numberOfLines={2}>
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { gap: 12 },
  flex: { flex: 1 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  rules: { marginTop: 12 },
  divider: { marginTop: 14 },
  recentTitle: { marginTop: 12, marginBottom: 4 },
  attempt: { gap: 2, paddingVertical: 8 },
  attemptHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hint: { marginTop: 8 },
});
