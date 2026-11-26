import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Divider, MinMaxInput, Text, useToast } from '@/components/ui';
import { describeError, HttpError } from '@/services/api';
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
}

/** How long the Save button shows "Saved" before going back to normal. */
const SAVED_FLASH_MS = 2000;

/** "Sensor limits" (min/max inputs for the alert rules) with one Save. */
export function ThresholdsSection({ deviceId, saved }: ThresholdsSectionProps) {
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
        toast.show('Thresholds saved', 'success');
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
        Alerts fire when a reading leaves its limits. Leave a field empty for no limit; “60k” means
        60,000 lux.
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
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  helper: { marginTop: 8 },
  limits: { gap: 4 },
  save: { gap: 12, marginTop: 16 },
  discard: { alignSelf: 'center' },
});
