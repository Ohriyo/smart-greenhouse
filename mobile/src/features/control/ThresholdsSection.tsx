import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThresholdSyncStatus } from '@/components/greenhouse';
import {
  Button,
  Card,
  Divider,
  MinMaxInput,
  Slider,
  Stepper,
  Text,
  useToast,
} from '@/components/ui';
import { describeError, HttpError } from '@/services/api';
import { useTheme } from '@/theme';
import type { Thresholds } from '@/types/api';

import {
  isDirty,
  isThresholdKey,
  PARTNER,
  toForm,
  validateForm,
  type FieldErrors,
  type ThresholdKey,
  type ThresholdsForm,
} from './thresholdsForm';
import { useUpdateThresholds } from './useUpdateThresholds';

interface ThresholdsSectionProps {
  deviceId: string;
  /** Thresholds saved on the backend (query data). */
  saved: Thresholds;
  online: boolean;
  reportedOn: number | null;
  reportedOff: number | null;
  reportedAt: string | null;
}

const FAN_MIN = 10;
const FAN_MAX = 50;
/** How long the Save button shows "Saved" before going back to normal. */
const SAVED_FLASH_MS = 2000;

/** Fan fields are only edited with the stepper / slider, so their text is always numeric. */
function numberOf(text: string, fallback: number): number {
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

/** "Fan thresholds" (steppers + sliders) and "Sensor limits" (min/max inputs) with one Save. */
export function ThresholdsSection({
  deviceId,
  saved,
  online,
  reportedOn,
  reportedOff,
  reportedAt,
}: ThresholdsSectionProps) {
  const theme = useTheme();
  const { colors } = theme;
  const toast = useToast();
  const mutation = useUpdateThresholds(deviceId);

  const [base, setBase] = useState(saved);
  const [form, setForm] = useState<ThresholdsForm>(() => toForm(saved));
  const [touched, setTouched] = useState<ReadonlySet<ThresholdKey>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [justSaved, setJustSaved] = useState(false);

  const dirty = isDirty(form, base);
  // Newer thresholds from the server (refetch, other screen): adopt them unless
  // the user is in the middle of editing.
  if (saved !== base && !dirty) {
    setBase(saved);
    setForm(toForm(saved));
  }

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), SAVED_FLASH_MS);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const validation = validateForm(form);
  const errorFor = (key: ThresholdKey): string | undefined => {
    if (serverErrors[key]) return serverErrors[key];
    if (validation.ok) return undefined;
    const visible = submitted || touched.has(key) || touched.has(PARTNER[key]);
    return visible ? validation.errors[key] : undefined;
  };

  const setField = (key: ThresholdKey, text: string) => {
    setForm((f) => ({ ...f, [key]: text }));
    setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));
    setJustSaved(false);
    if (serverErrors[key]) setServerErrors(({ [key]: _removed, ...rest }) => rest);
  };

  const reset = (next: Thresholds) => {
    setBase(next);
    setForm(toForm(next));
    setTouched(new Set());
    setSubmitted(false);
    setServerErrors({});
  };

  const save = () => {
    if (!dirty || mutation.isPending) return;
    setSubmitted(true);
    if (!validation.ok) {
      toast.show('Check the highlighted fields', 'error');
      return;
    }
    mutation.mutate(validation.data, {
      onSuccess: (res) => {
        reset(res.thresholds);
        setJustSaved(true);
        toast.show(
          res.deviceSync === 'sent'
            ? 'Thresholds saved and sent to the greenhouse'
            : 'Thresholds saved. The greenhouse gets them when it reconnects.',
          'success',
        );
      },
      onError: (err) => {
        if (err instanceof HttpError && err.code === 'VALIDATION_ERROR') {
          const next: FieldErrors = {};
          for (const d of err.details) {
            const key = d.path.split('.')[0] ?? '';
            if (isThresholdKey(key)) next[key] ??= d.message;
          }
          setServerErrors(next);
        }
        toast.show(describeError(err), 'error');
      },
    });
  };

  const on = numberOf(form.fanOnTemp, base.fanOnTemp);
  const off = numberOf(form.fanOffTemp, base.fanOffTemp);
  const onError = errorFor('fanOnTemp');
  const offError = errorFor('fanOffTemp');
  const busy = mutation.isPending;

  const limit = (minKey: ThresholdKey, maxKey: ThresholdKey) => ({
    min: form[minKey],
    max: form[maxKey],
    onChangeMin: (t: string) => setField(minKey, t),
    onChangeMax: (t: string) => setField(maxKey, t),
    minError: errorFor(minKey) ?? null,
    maxError: errorFor(maxKey) ?? null,
  });

  return (
    <>
      <Card eyebrow="Automation" title="Fan thresholds" meta="°C">
        <View style={styles.fan}>
          <FanRow
            label="Fan turns ON at"
            dotColor={colors.chart.airTemp}
            value={on}
            error={onError}
            disabled={busy}
            onChange={(v) => setField('fanOnTemp', String(v))}
          />
          <FanRow
            label="Fan turns OFF at"
            dotColor={colors.accent}
            value={off}
            error={offError}
            disabled={busy}
            onChange={(v) => setField('fanOffTemp', String(v))}
          />
        </View>
        <Text variant="micro" color="secondary" style={styles.helper}>
          Hysteresis prevents the fan from switching rapidly near one temperature.
        </Text>
      </Card>

      <Card eyebrow="Alert rules" title="Sensor limits">
        <View style={styles.limits}>
          <MinMaxInput
            label="Air temperature"
            unit="°C"
            spokenUnit="degrees Celsius"
            {...limit('airTempMin', 'airTempMax')}
          />
          <Divider />
          <MinMaxInput
            label="Humidity"
            unit="%"
            spokenUnit="percent"
            {...limit('humidityMin', 'humidityMax')}
          />
          <Divider />
          <MinMaxInput
            label="Soil moisture"
            unit="%"
            spokenUnit="percent"
            {...limit('soilMoistureMin', 'soilMoistureMax')}
          />
          <Divider />
          <MinMaxInput label="Light" unit="lux" spokenUnit="lux" {...limit('luxMin', 'luxMax')} />
        </View>
        <Text variant="micro" color="tertiary" style={styles.helper}>
          Alerts fire when a reading leaves its limits. Leave a field empty for no limit; “60k”
          means 60,000 lux.
        </Text>

        <View style={styles.save}>
          <Button
            label={busy ? 'Saving…' : justSaved ? 'Saved' : 'Save thresholds'}
            icon={justSaved && !busy ? 'checkmark' : undefined}
            size="large"
            fullWidth
            loading={busy}
            disabled={!dirty && !justSaved}
            onPress={save}
          />
          {dirty && !busy ? (
            <Button
              label="Discard changes"
              variant="ghost"
              size="small"
              onPress={() => reset(base)}
              style={styles.discard}
            />
          ) : null}
          <ThresholdSyncStatus
            savedOn={base.fanOnTemp}
            savedOff={base.fanOffTemp}
            reportedOn={reportedOn}
            reportedOff={reportedOff}
            reportedAt={reportedAt}
            online={online}
          />
        </View>
      </Card>
    </>
  );
}

/** "● Fan turns ON at   − 32° +" with a colored slider underneath. */
function FanRow({
  label,
  dotColor,
  value,
  error,
  disabled,
  onChange,
}: {
  label: string;
  dotColor: string;
  value: number;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.fanRow}>
      <View style={styles.fanHead}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} importantForAccessibility="no" />
        <Text
          variant="caption"
          color="secondary"
          style={styles.fanLabel}
          importantForAccessibility="no"
        >
          {label}
        </Text>
        <Stepper
          label={label}
          showLabel={false}
          value={value}
          onChange={onChange}
          step={1}
          min={FAN_MIN}
          max={FAN_MAX}
          unit="°"
          spokenUnit="degrees Celsius"
          decimals={Number.isInteger(value) ? 0 : 1}
        />
      </View>
      <Slider
        value={value}
        min={FAN_MIN}
        max={FAN_MAX}
        step={1}
        onChange={onChange}
        color={dotColor}
        accessibilityLabel={label}
        spokenUnit="degrees Celsius"
        disabled={disabled}
      />
      {error ? (
        <Text variant="caption" tint={theme.colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fan: { gap: 8 },
  fanRow: { gap: 0 },
  fanHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fanLabel: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  helper: { marginTop: 8 },
  limits: { gap: 4 },
  save: { gap: 12, marginTop: 16 },
  discard: { alignSelf: 'center' },
});
