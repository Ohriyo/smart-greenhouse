import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConnectionBanner } from '@/components/greenhouse';
import {
  Button,
  Card,
  Screen,
  SegmentedControl,
  StatusPill,
  Stepper,
  Text,
  useToast,
  type SegmentOption,
} from '@/components/ui';
import { mockOfflineLastSeen, mockReading, mockThresholds } from '@/constants/mock';
import { useMockStore } from '@/store/mockStore';
import { useTheme } from '@/theme';
import { ThresholdsUpdateSchema, type FanMode, type ThresholdsUpdate } from '@/types/api';
import { formatValue } from '@/utils/sensors';

const MODE_OPTIONS: readonly SegmentOption<FanMode>[] = [
  { value: 'auto', label: 'Auto', accessibilityLabel: 'Automatic' },
  { value: 'on', label: 'On', accessibilityLabel: 'Force on' },
  { value: 'off', label: 'Off', accessibilityLabel: 'Force off' },
];
const MODE_LABEL: Record<FanMode, string> = { auto: 'Auto', on: 'Forced on', off: 'Forced off' };

/** Simulated command round-trip (send → device applies → confirmed in telemetry). */
const MOCK_CONFIRM_MS = 1200;

function toUpdate(t: typeof mockThresholds): ThresholdsUpdate {
  return {
    fanOnTemp: t.fanOnTemp,
    fanOffTemp: t.fanOffTemp,
    airTempMin: t.airTempMin,
    airTempMax: t.airTempMax,
    humidityMin: t.humidityMin,
    humidityMax: t.humidityMax,
    soilMoistureMin: t.soilMoistureMin,
    soilMoistureMax: t.soilMoistureMax,
    luxMin: t.luxMin,
    luxMax: t.luxMax,
  };
}

export default function ControlScreen() {
  const theme = useTheme();
  const toast = useToast();
  const scenario = useMockStore((s) => s.scenario);
  const online = scenario === 'normal' || scenario === 'loading';

  // Fan mode: the UI shows only the *confirmed* mode; the selector is a draft.
  const [confirmedMode, setConfirmedMode] = useState<FanMode>(mockReading.fanMode);
  const [draftMode, setDraftMode] = useState<FanMode>(mockReading.fanMode);
  const [sending, setSending] = useState(false);

  const [saved, setSaved] = useState<ThresholdsUpdate>(() => toUpdate(mockThresholds));
  const [draft, setDraft] = useState<ThresholdsUpdate>(saved);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const set = <K extends keyof ThresholdsUpdate>(key: K, value: ThresholdsUpdate[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const applyMode = () => {
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setConfirmedMode(draftMode);
      toast.show(`Fan set to ${MODE_LABEL[draftMode]} (confirmed)`, 'success');
    }, MOCK_CONFIRM_MS);
  };

  const saveThresholds = () => {
    const result = ThresholdsUpdateSchema.safeParse(draft);
    if (!result.success) {
      toast.show(result.error.issues[0]?.message ?? 'Invalid values', 'error');
      return;
    }
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaved(result.data);
      toast.show('Thresholds saved and sent to the greenhouse', 'success');
    }, MOCK_CONFIRM_MS);
  };

  return (
    <Screen
      title="Control"
      subtitle="Fan and alert thresholds"
      banner={
        <ConnectionBanner
          state={
            online ? 'connected' : scenario === 'error' ? 'backend-unreachable' : 'device-offline'
          }
          lastSeen={mockOfflineLastSeen}
        />
      }
    >
      <Card style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text variant="heading" accessibilityRole="header">
            Fan mode
          </Text>
          <StatusPill
            tone={confirmedMode === 'auto' ? 'accent' : 'warning'}
            label={MODE_LABEL[confirmedMode]}
            accessibilityLabel={`Current mode: ${MODE_LABEL[confirmedMode]}`}
          />
        </View>
        <SegmentedControl
          options={MODE_OPTIONS}
          value={draftMode}
          onChange={setDraftMode}
          accessibilityLabel="Fan mode"
          disabled={!online || sending}
        />
        <Text variant="caption" color="secondary">
          {draftMode === 'auto'
            ? `The greenhouse switches the fan on at ${formatValue(draft.fanOnTemp, 1)} °C and off at ${formatValue(draft.fanOffTemp, 1)} °C, even without Wi-Fi.`
            : `Manual override: the fan stays ${draftMode} until you switch back to Auto.`}
        </Text>
        <Button
          label={sending ? 'Waiting for confirmation…' : 'Apply'}
          onPress={applyMode}
          loading={sending}
          disabled={!online || draftMode === confirmedMode}
          fullWidth
        />
      </Card>

      <Card style={styles.section}>
        <Text variant="heading" accessibilityRole="header">
          Fan thresholds
        </Text>
        <Stepper
          label="Turn on at"
          value={draft.fanOnTemp}
          onChange={(v) => set('fanOnTemp', v)}
          step={0.5}
          min={Math.max(10, draft.fanOffTemp + 1)}
          max={50}
          unit="°C"
          decimals={1}
        />
        <Stepper
          label="Turn off at"
          value={draft.fanOffTemp}
          onChange={(v) => set('fanOffTemp', v)}
          step={0.5}
          min={10}
          max={Math.min(50, draft.fanOnTemp - 1)}
          unit="°C"
          decimals={1}
        />
      </Card>

      <Card style={styles.section}>
        <Text variant="heading" accessibilityRole="header">
          Alert limits
        </Text>
        <LimitPair
          title="Air temperature"
          unit="°C"
          step={0.5}
          decimals={1}
          bounds={[-40, 80]}
          min={draft.airTempMin}
          max={draft.airTempMax}
          onMin={(v) => set('airTempMin', v)}
          onMax={(v) => set('airTempMax', v)}
        />
        <Divider color={theme.colors.border} />
        <LimitPair
          title="Humidity"
          unit="%"
          step={1}
          bounds={[0, 100]}
          min={draft.humidityMin}
          max={draft.humidityMax}
          onMin={(v) => set('humidityMin', v)}
          onMax={(v) => set('humidityMax', v)}
        />
        <Divider color={theme.colors.border} />
        <LimitPair
          title="Soil moisture"
          unit="%"
          step={1}
          bounds={[0, 100]}
          min={draft.soilMoistureMin}
          max={draft.soilMoistureMax}
          onMin={(v) => set('soilMoistureMin', v)}
          onMax={(v) => set('soilMoistureMax', v)}
        />
        <Divider color={theme.colors.border} />
        <Text color="secondary">Light: no limits set (alerts off).</Text>
      </Card>

      <View style={styles.actions}>
        <Button
          label="Save thresholds"
          icon="save-outline"
          onPress={saveThresholds}
          loading={saving}
          disabled={!dirty || !online}
          fullWidth
        />
        <Button
          label="Discard changes"
          variant="secondary"
          onPress={() => setDraft(saved)}
          disabled={!dirty || saving}
          fullWidth
        />
      </View>
    </Screen>
  );
}

function LimitPair({
  title,
  unit,
  step,
  decimals = 0,
  bounds,
  min,
  max,
  onMin,
  onMax,
}: {
  title: string;
  unit: string;
  step: number;
  decimals?: number;
  bounds: [number, number];
  min: number | null;
  max: number | null;
  onMin: (v: number) => void;
  onMax: (v: number) => void;
}) {
  return (
    <View style={styles.pair}>
      <Text variant="bodyStrong">{title}</Text>
      {min !== null ? (
        <Stepper
          label="Minimum"
          value={min}
          onChange={onMin}
          step={step}
          min={bounds[0]}
          max={max !== null ? max - step : bounds[1]}
          unit={unit}
          decimals={decimals}
        />
      ) : null}
      {max !== null ? (
        <Stepper
          label="Maximum"
          value={max}
          onChange={onMax}
          step={step}
          min={min !== null ? min + step : bounds[0]}
          max={bounds[1]}
          unit={unit}
          decimals={decimals}
        />
      ) : null}
    </View>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color }} />;
}

const styles = StyleSheet.create({
  section: { gap: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pair: { gap: 6 },
  actions: { gap: 10 },
});
