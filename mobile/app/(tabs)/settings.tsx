import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Screen,
  SegmentedControl,
  StatusPill,
  Text,
  TextField,
  useToast,
  type IconName,
  type SegmentOption,
} from '@/components/ui';
import { DEFAULT_API_URL } from '@/constants/config';
import { api, describeError } from '@/services/api';
import { useLiveStore, type SocketStatus } from '@/store/liveStore';
import { useMockStore, type PreviewScenario } from '@/store/mockStore';
import { ApiUrlSchema, useSettingsStore } from '@/store/settingsStore';
import { useTheme, type StatusTone } from '@/theme';
import type { Health } from '@/types/api';

const SCENARIOS: readonly SegmentOption<PreviewScenario>[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'loading', label: 'Loading' },
  { value: 'offline', label: 'Offline', accessibilityLabel: 'Device offline' },
  { value: 'error', label: 'Error', accessibilityLabel: 'Backend unreachable' },
];

const SOCKET_LABEL: Record<SocketStatus, { tone: StatusTone; label: string }> = {
  idle: { tone: 'neutral', label: 'Not started' },
  connecting: { tone: 'neutral', label: 'Connecting…' },
  connected: { tone: 'ok', label: 'Connected' },
  reconnecting: { tone: 'warning', label: 'Reconnecting…' },
  error: { tone: 'danger', label: 'Unreachable' },
};

type TestResult = { ok: true; health: Health } | { ok: false; message: string } | null;

export default function SettingsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const apiUrl = useSettingsStore((s) => s.apiUrl);
  const setApiUrl = useSettingsStore((s) => s.setApiUrl);
  const resetApiUrl = useSettingsStore((s) => s.resetApiUrl);
  const socket = useLiveStore((s) => s.socket);
  const socketError = useLiveStore((s) => s.socketError);
  const scenario = useMockStore((s) => s.scenario);
  const setScenario = useMockStore((s) => s.setScenario);
  const resetAlerts = useMockStore((s) => s.resetAlerts);

  const [input, setInput] = useState(apiUrl ?? '');
  const [inputError, setInputError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult>(null);

  const parsed = ApiUrlSchema.safeParse(input);
  const dirty = parsed.success ? parsed.data !== apiUrl : input.trim() !== (apiUrl ?? '');

  const validate = (): string | null => {
    if (parsed.success) {
      setInputError(null);
      return parsed.data;
    }
    setInputError(parsed.error.issues[0]?.message ?? 'Invalid URL');
    return null;
  };

  /** Tests the address in the field (saved or not) by calling GET /api/health. */
  const test = async () => {
    const url = validate();
    if (!url) return;
    setTesting(true);
    setResult(null);
    try {
      const health = await api.health({ baseUrl: url });
      setResult({ ok: true, health });
    } catch (err) {
      setResult({ ok: false, message: describeError(err) });
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    const url = validate();
    if (!url) return;
    setApiUrl(url);
    setInput(url);
    toast.show('Server address saved, reconnecting', 'success');
  };

  const reset = () => {
    resetApiUrl();
    setInput(DEFAULT_API_URL ?? '');
    setInputError(null);
    setResult(null);
    toast.show('Server address reset to the default', 'info');
  };

  const live = SOCKET_LABEL[socket];

  return (
    <Screen title="Settings">
      <Section title="Server">
        <TextField
          label="Backend address"
          value={input}
          onChangeText={(t) => {
            setInput(t);
            setInputError(null);
            setResult(null);
          }}
          placeholder="http://192.168.1.50:4000"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
          returnKeyType="done"
          onSubmitEditing={() => void test()}
          error={inputError}
          hint="Your laptop's LAN IP (ipconfig → IPv4 Address) and port 4000."
        />

        {result ? <TestResultView result={result} /> : null}

        <View style={styles.buttons}>
          <Button
            label="Test connection"
            icon="pulse"
            variant="secondary"
            onPress={() => void test()}
            loading={testing}
            fullWidth
          />
          <Button
            label="Save"
            icon="save-outline"
            onPress={save}
            disabled={!dirty || testing}
            fullWidth
          />
          {DEFAULT_API_URL && apiUrl !== DEFAULT_API_URL ? (
            <Button
              label="Reset to default"
              variant="ghost"
              onPress={reset}
              accessibilityHint={`Sets the address back to ${DEFAULT_API_URL}`}
            />
          ) : null}
        </View>

        <View
          style={[styles.statusRow, { borderTopColor: theme.colors.border }]}
          accessible
          accessibilityLabel={`Live connection: ${live.label}${socketError && socket === 'error' ? `. ${socketError}` : ''}`}
        >
          <Text style={styles.flex}>Live connection</Text>
          <StatusPill tone={live.tone} label={live.label} />
        </View>
        <Text variant="caption" color="tertiary">
          Saved address: {apiUrl ?? 'none'}
        </Text>
      </Section>

      <Section title="Appearance">
        <Row
          icon={theme.scheme === 'dark' ? 'moon-outline' : 'sunny-outline'}
          label="Theme"
          value={`Follows system (${theme.scheme})`}
        />
      </Section>

      <Section title="Design preview">
        <Text variant="caption" color="secondary">
          Temporary: previews History, Alerts and Control (still mock data) in other states. The
          Dashboard is live.
        </Text>
        <SegmentedControl
          options={SCENARIOS}
          value={scenario}
          onChange={setScenario}
          accessibilityLabel="Preview state"
        />
        <Button
          label="Reset mock alerts"
          variant="secondary"
          icon="refresh"
          onPress={() => {
            resetAlerts();
            toast.show('Mock alerts reset', 'info');
          }}
        />
      </Section>

      <Section title="About">
        <Row icon="leaf-outline" label="Version" value={Constants.expoConfig?.version ?? '—'} />
        <Row
          icon="logo-android"
          label="Package"
          value={Constants.expoConfig?.android?.package ?? '—'}
        />
      </Section>
    </Screen>
  );
}

function TestResultView({ result }: { result: Exclude<TestResult, null> }) {
  const theme = useTheme();
  const ok = result.ok && result.health.status === 'ok';
  const color = result.ok ? (ok ? theme.colors.ok : theme.colors.warning) : theme.colors.danger;
  const bg = result.ok
    ? ok
      ? theme.colors.okSoft
      : theme.colors.warningSoft
    : theme.colors.dangerSoft;
  const title = result.ok ? (ok ? 'Connected' : 'Connected, but degraded') : 'Connection failed';
  const detail = result.ok
    ? `Database ${result.health.db} · MQTT ${result.health.mqtt} · up ${formatUptime(result.health.uptimeSec)}`
    : result.message;

  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${title}. ${detail}`}
      style={[styles.result, { backgroundColor: bg, borderRadius: theme.radii.md }]}
    >
      <Ionicons
        name={result.ok ? (ok ? 'checkmark-circle' : 'warning') : 'close-circle'}
        size={22}
        color={color}
      />
      <View style={styles.flex}>
        <Text variant="bodyStrong" tint={color}>
          {title}
        </Text>
        <Text variant="caption" color="secondary">
          {detail}
        </Text>
      </View>
    </View>
  );
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec} s`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min`;
  return `${Math.floor(sec / 3600)} h`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" color="secondary" uppercase accessibilityRole="header">
        {title}
      </Text>
      <Card style={styles.card}>{children}</Card>
    </View>
  );
}

function Row({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={22} color={theme.colors.textSecondary} />
      <View style={styles.flex}>
        <Text>{label}</Text>
        <Text variant="caption" color="secondary" selectable>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  card: { gap: 14 },
  buttons: { gap: 10 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  result: { flexDirection: 'row', gap: 12, padding: 12, alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 },
  flex: { flex: 1, gap: 2 },
});
