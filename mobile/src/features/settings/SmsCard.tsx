import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Divider,
  ErrorState,
  Icon,
  ListRow,
  Skeleton,
  Stepper,
  Text,
  TextField,
  Toggle,
  useToast,
} from '@/components/ui';
import { useSendTestSms, useSmsSettings, useUpdateSmsSettings } from '@/features/sms/queries';
import { describeError, HttpError } from '@/services/api';
import { useTheme } from '@/theme';
import { SmsSettingsUpdateSchema, type SmsSettings } from '@/types/api';
import { formatPhone, isValidPhone, normalizePhone } from '@/utils/phone';
import { formatRelative, useNow } from '@/utils/time';

const KIND_LABEL = {
  critical: 'Critical alert',
  offline: 'Offline alert',
  closing: 'All clear',
  test: 'Test',
} as const;

/** "SMS ALERTS": the owner's number, on/off, "offline after N minutes", a test SMS. */
export function SmsSection() {
  const settings = useSmsSettings();

  if (settings.data) return <SmsCard saved={settings.data} />;
  return (
    <Card>
      {settings.isError ? (
        <ErrorState
          title="Couldn't load SMS settings"
          message={describeError(settings.error)}
          onRetry={() => void settings.refetch()}
          retrying={settings.isFetching}
        />
      ) : (
        <View accessibilityLabel="Loading SMS settings" style={styles.loading}>
          <Skeleton height={44} />
          <Skeleton height={60} />
        </View>
      )}
    </Card>
  );
}

interface FormState {
  enabled: boolean;
  phoneText: string;
  offlineAfterMin: number;
}

const toForm = (s: SmsSettings): FormState => ({
  enabled: s.enabled,
  phoneText: s.phone ? formatPhone(s.phone) : '',
  offlineAfterMin: s.offlineAfterMin,
});

function SmsCard({ saved }: { saved: SmsSettings }) {
  const theme = useTheme();
  const { colors } = theme;
  const toast = useToast();
  const update = useUpdateSmsSettings();
  const test = useSendTestSms();
  const now = useNow(15_000);

  const [base, setBase] = useState(saved);
  const [form, setForm] = useState<FormState>(() => toForm(saved));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // What the form would save: the typed number is converted ("0917…" → "+63917…").
  const normalized = normalizePhone(form.phoneText);
  const parsed = SmsSettingsUpdateSchema.safeParse({
    enabled: form.enabled,
    phone: normalized === '' ? null : normalized,
    offlineAfterMin: form.offlineAfterMin,
  });
  const dirty =
    form.enabled !== base.enabled ||
    form.offlineAfterMin !== base.offlineAfterMin ||
    (normalized === '' ? null : normalized) !== base.phone;

  // Newer data from the server (refetch, test SMS): adopt the form unless it is being edited.
  if (saved !== base) {
    setBase(saved);
    if (!dirty) setForm(toForm(saved));
  }

  const phoneTyped = form.phoneText.trim() !== '';
  const phoneError =
    serverError ??
    (phoneTyped && !isValidPhone(normalized) && (submitted || form.phoneText.length > 6)
      ? 'Enter the number like +63 917 123 4567 or 0917 123 4567'
      : !parsed.success && submitted
        ? (parsed.error.issues.find((i) => i.path[0] === 'phone')?.message ?? null)
        : null);

  const change = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setServerError(null);
  };

  const save = () => {
    setSubmitted(true);
    if (!parsed.success) {
      toast.show('Check the highlighted fields', 'error');
      return;
    }
    update.mutate(parsed.data, {
      onSuccess: (next) => {
        setBase(next);
        setForm(toForm(next));
        setSubmitted(false);
        toast.show(
          next.enabled ? 'SMS alerts are on' : 'SMS settings saved (alerts are off)',
          'success',
        );
      },
      onError: (err) => {
        if (err instanceof HttpError && err.code === 'VALIDATION_ERROR') {
          setServerError(err.details[0]?.message ?? err.message);
        }
        toast.show(describeError(err), 'error');
      },
    });
  };

  const sendTest = () =>
    test.mutate(undefined, {
      onSuccess: (r) => {
        if (r.status === 'failed') {
          toast.show(`The SMS was not sent. ${r.error ?? ''}`.trim(), 'error');
        } else if (r.simulated) {
          toast.show('Test mode: the SMS was only written to the backend log.', 'info');
        } else {
          toast.show(`Test SMS sent to ${formatPhone(base.phone ?? '')}.`, 'success');
        }
      },
      onError: (err) => toast.show(describeError(err), 'error'),
    });

  const last = base.last;
  const lastBad = last !== null && last.status !== 'sent';

  return (
    <Card>
      <ListRow
        title="SMS alerts"
        subtitle="Critical readings and an offline greenhouse, to the owner’s phone"
        icon="chatbubble-ellipses-outline"
        trailing={
          <Toggle
            value={form.enabled}
            onValueChange={(enabled) => change({ enabled })}
            accessibilityLabel="SMS alerts"
          />
        }
      />

      {base.simulated ? (
        <View
          style={[styles.notice, { backgroundColor: colors.warningSoft }]}
          accessible
          accessibilityLabel="Test mode: messages are only written to the backend log and not sent. Set SMS_PROVIDER in backend .env."
        >
          <Icon name="information-circle-outline" size={18} color={colors.warning} />
          <Text variant="caption" tint={colors.warning} style={styles.flex}>
            Test mode: messages are only written to the backend log, not sent. See docs/setup-sms.md
            to send real SMS.
          </Text>
        </View>
      ) : null}

      <View style={styles.fields}>
        <TextField
          label="Owner’s mobile number"
          icon="call-outline"
          value={form.phoneText}
          onChangeText={(phoneText) => change({ phoneText })}
          onBlur={() => {
            // Show the number the way it will be saved.
            if (isValidPhone(normalized)) change({ phoneText: formatPhone(normalized) });
          }}
          placeholder="+63 917 123 4567"
          keyboardType="phone-pad"
          inputMode="tel"
          autoComplete="tel"
          maxLength={20}
          error={phoneError}
          hint="One number. You can type +63 917… or 0917…"
        />
        <View style={styles.stepper}>
          <Text
            variant="caption"
            color="secondary"
            style={styles.flex}
            importantForAccessibility="no"
          >
            Greenhouse offline for more than
          </Text>
          <Stepper
            label="Minutes offline before an SMS"
            showLabel={false}
            value={form.offlineAfterMin}
            onChange={(offlineAfterMin) => change({ offlineAfterMin })}
            step={5}
            min={5}
            max={120}
            unit="min"
            spokenUnit="minutes"
          />
        </View>
      </View>

      {dirty ? (
        <Button
          label="Save SMS settings"
          fullWidth
          loading={update.isPending}
          onPress={save}
          style={styles.save}
        />
      ) : null}

      <Divider style={styles.divider} />
      <View style={styles.actions}>
        <Button
          label="Send test SMS"
          variant="secondary"
          size="small"
          loading={test.isPending}
          disabled={base.phone === null || dirty}
          onPress={sendTest}
          accessibilityHint={
            base.phone === null
              ? 'Save the owner’s number first'
              : dirty
                ? 'Save your changes first'
                : 'Sends one message to the saved number'
          }
        />
        {base.phone === null || dirty ? (
          <Text variant="micro" color="tertiary" style={styles.flex}>
            {base.phone === null ? 'Save a number first' : 'Save your changes first'}
          </Text>
        ) : null}
      </View>

      <View style={styles.status} accessibilityLiveRegion="polite">
        {last ? (
          <View style={styles.statusRow}>
            <Icon
              name={lastBad ? 'alert-circle-outline' : 'checkmark'}
              size={16}
              color={lastBad ? colors.danger : colors.accent}
            />
            <Text
              variant="caption"
              tint={lastBad ? colors.danger : colors.textSecondary}
              style={styles.flex}
            >
              Last SMS: {KIND_LABEL[last.kind]} ·{' '}
              {last.status === 'skipped' ? 'skipped' : last.status} · {formatRelative(last.ts, now)}
              {lastBad && last.error ? `. ${last.error}` : ''}
            </Text>
          </View>
        ) : (
          <Text variant="caption" color="secondary">
            No SMS sent yet.
          </Text>
        )}
        <Text variant="micro" color="tertiary">
          Sent in the last 24 hours: {base.sentLast24h} of {base.dailyCap} (safety limit)
        </Text>
      </View>
    </Card>
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
  fields: { gap: 14, marginTop: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  save: { marginTop: 14 },
  divider: { marginTop: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12 },
  status: { gap: 4, marginTop: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
});
