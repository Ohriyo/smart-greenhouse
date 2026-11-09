import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Divider,
  Icon,
  StatusPill,
  Text,
  TextField,
  useToast,
} from '@/components/ui';
import { DEFAULT_API_URL } from '@/constants/config';
import { api, describeError } from '@/services/api';
import { useLiveStore, type SocketStatus } from '@/store/liveStore';
import { ApiUrlSchema, useSettingsStore } from '@/store/settingsStore';
import { useTheme, type StatusTone } from '@/theme';
import type { Health } from '@/types/api';
import { formatUptime } from '@/utils/time';

const SOCKET_LABEL: Record<SocketStatus, { tone: StatusTone; label: string }> = {
  idle: { tone: 'neutral', label: 'Not started' },
  connecting: { tone: 'neutral', label: 'Connecting…' },
  connected: { tone: 'ok', label: 'Connected' },
  reconnecting: { tone: 'warning', label: 'Reconnecting…' },
  error: { tone: 'danger', label: 'Unreachable' },
  paused: { tone: 'neutral', label: 'Paused (offline)' },
};

type TestResult = { ok: true; health: Health; ms: number } | { ok: false; message: string } | null;

/** "SERVER CONNECTION": the backend address, a real round-trip test, and the live link state. */
export function ServerCard() {
  const toast = useToast();
  const apiUrl = useSettingsStore((s) => s.apiUrl);
  const setApiUrl = useSettingsStore((s) => s.setApiUrl);
  const resetApiUrl = useSettingsStore((s) => s.resetApiUrl);
  const socket = useLiveStore((s) => s.socket);
  const socketError = useLiveStore((s) => s.socketError);

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

  /** Tests the address in the field (saved or not): times GET /api/health end to end. */
  const test = async () => {
    const url = validate();
    if (!url) return;
    setTesting(true);
    setResult(null);
    const started = performance.now();
    try {
      const health = await api.health({ baseUrl: url });
      setResult({ ok: true, health, ms: Math.max(1, Math.round(performance.now() - started)) });
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
    <Card>
      <TextField
        label="Server URL"
        icon="mci-server"
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

      <View style={styles.actions}>
        <Button
          label="Test connection"
          variant="secondary"
          fullWidth
          loading={testing}
          onPress={() => void test()}
        />
        {dirty ? <Button label="Save address" fullWidth disabled={testing} onPress={save} /> : null}
        {DEFAULT_API_URL && apiUrl !== DEFAULT_API_URL ? (
          <Button
            label="Reset to default"
            variant="ghost"
            size="small"
            onPress={reset}
            style={styles.center}
            accessibilityHint={`Sets the address back to ${DEFAULT_API_URL}`}
          />
        ) : null}
      </View>

      {result ? <TestResultLine result={result} /> : null}

      <Divider style={styles.divider} />
      <View
        style={styles.live}
        accessible
        accessibilityLabel={`Live connection: ${live.label}${socketError && socket === 'error' ? `. ${socketError}` : ''}`}
      >
        <Text variant="caption" color="secondary" style={styles.flex}>
          Live connection
        </Text>
        <StatusPill tone={live.tone} label={live.label} variant="plain" />
      </View>
    </Card>
  );
}

/** "✓ Connected · 42 ms response time" (green), amber when degraded, red on failure. */
function TestResultLine({ result }: { result: Exclude<TestResult, null> }) {
  const { colors } = useTheme();
  const good = result.ok && result.health.status === 'ok';
  const color = result.ok ? (good ? colors.ok : colors.warning) : colors.danger;
  const headline = result.ok
    ? `${good ? 'Connected' : 'Connected, but degraded'} · ${result.ms} ms response time`
    : `Connection failed · ${result.message}`;
  const detail = result.ok
    ? `Database ${result.health.db} · MQTT ${result.health.mqtt} · server up ${formatUptime(result.health.uptimeSec)}`
    : null;

  return (
    <View
      style={styles.result}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={detail ? `${headline}. ${detail}` : headline}
    >
      <Icon
        name={result.ok ? (good ? 'checkmark' : 'warning-outline') : 'close'}
        size={16}
        color={color}
      />
      <View style={styles.flex}>
        <Text variant="caption" tint={color}>
          {headline}
        </Text>
        {detail ? (
          <Text variant="micro" color="secondary">
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10, marginTop: 14 },
  center: { alignSelf: 'center' },
  result: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14 },
  divider: { marginTop: 14 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingTop: 4 },
  flex: { flex: 1, gap: 2 },
});
