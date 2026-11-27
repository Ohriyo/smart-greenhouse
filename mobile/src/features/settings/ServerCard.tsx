import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Divider, Icon, StatusPill, Text } from '@/components/ui';
import { API_URL, LATEST_POLL_MS } from '@/constants/config';
import { api, describeError, HttpError } from '@/services/api';
import { useLiveStore, type PollStatus, type SocketStatus } from '@/store/liveStore';
import { useTheme, type StatusTone } from '@/theme';
import type { Health } from '@/types/api';
import { formatUptime } from '@/utils/time';

const SOCKET_LABEL: Record<SocketStatus, { tone: StatusTone; label: string }> = {
  idle: { tone: 'neutral', label: 'Not started' },
  connecting: { tone: 'neutral', label: 'Connecting…' },
  connected: { tone: 'ok', label: 'Connected' },
  reconnecting: { tone: 'warning', label: 'Reconnecting…' },
  error: { tone: 'danger', label: 'Unreachable' },
  paused: { tone: 'neutral', label: 'Paused' },
};

const POLL_LABEL: Record<PollStatus, { tone: StatusTone; label: string }> = {
  idle: { tone: 'neutral', label: 'Waiting' },
  ok: { tone: 'ok', label: 'Working' },
  error: { tone: 'danger', label: 'Failing' },
};

type TestResult = { ok: true; health: Health; ms: number } | { ok: false; message: string } | null;

/**
 * "SERVER CONNECTION": the backend address (fixed when the app is built, from
 * EXPO_PUBLIC_API_URL), a real round-trip test, and how live data arrives.
 */
export function ServerCard() {
  const { colors } = useTheme();
  const socket = useLiveStore((s) => s.socket);
  const socketError = useLiveStore((s) => s.socketError);
  const poll = useLiveStore((s) => s.poll);

  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult>(null);

  /** Times GET /api/health end to end. */
  const test = async () => {
    setTesting(true);
    setResult(null);
    const started = performance.now();
    try {
      const health = await api.health();
      setResult({ ok: true, health, ms: Math.max(1, Math.round(performance.now() - started)) });
    } catch (err) {
      setResult({
        ok: false,
        // /api/health answers 503 when the server runs but its database doesn't.
        message:
          err instanceof HttpError && err.status === 503
            ? 'The server answered, but its database is not reachable.'
            : describeError(err),
      });
    } finally {
      setTesting(false);
    }
  };

  const live = SOCKET_LABEL[socket];
  const polling = POLL_LABEL[poll];

  return (
    <Card>
      <View
        style={styles.address}
        accessible
        accessibilityLabel={
          API_URL ? `Server: ${API_URL}` : 'No server address in this build (EXPO_PUBLIC_API_URL)'
        }
      >
        <Icon name="server-outline" size={20} color={colors.textSecondary} />
        <View style={styles.flex}>
          <Text variant="caption" color="secondary">
            Server
          </Text>
          <Text variant="bodyStrong" selectable numberOfLines={2}>
            {API_URL ?? 'Not set in this build'}
          </Text>
          <Text variant="micro" color="tertiary">
            Set when the app is built (EXPO_PUBLIC_API_URL).
          </Text>
        </View>
      </View>

      <Button
        label="Test connection"
        variant="secondary"
        fullWidth
        loading={testing}
        disabled={!API_URL}
        onPress={() => void test()}
        style={styles.test}
      />

      {result ? <TestResultLine result={result} /> : null}

      <Divider style={styles.divider} />
      <View
        style={styles.live}
        accessible
        accessibilityLabel={`Live updates: ${live.label}${socketError && socket === 'error' ? `. ${socketError}` : ''}`}
      >
        <Text variant="caption" color="secondary" style={styles.flex}>
          Live updates
        </Text>
        <StatusPill tone={live.tone} label={live.label} variant="plain" />
      </View>
      <View
        style={styles.live}
        accessible
        accessibilityLabel={`Latest reading, checked every ${LATEST_POLL_MS / 1000} seconds: ${polling.label}`}
      >
        <Text variant="caption" color="secondary" style={styles.flex}>
          Latest reading (checked every {LATEST_POLL_MS / 1000} s)
        </Text>
        <StatusPill tone={polling.tone} label={polling.label} variant="plain" />
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
    ? `Database ${result.health.db} · server up ${formatUptime(result.health.uptimeSec)}`
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
  address: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  test: { marginTop: 14 },
  result: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14 },
  divider: { marginTop: 14 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingTop: 4 },
  flex: { flex: 1, gap: 2 },
});
