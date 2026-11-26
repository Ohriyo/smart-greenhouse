import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { WAKING_HINT_AFTER_MS } from '@/constants/config';
import { useTheme } from '@/theme';

/** True once `active` has stayed true for `delayMs` (false again as soon as it ends). */
function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  // A new loading episode starts hidden again (adjusting state during render).
  if (!active && elapsed) setElapsed(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setElapsed(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);
  return active && elapsed;
}

/**
 * Spinner + "Waking up server…" when a load takes longer than 3 s: the free
 * server sleeps when idle and needs up to a minute to start. Nothing is shown
 * before that, so normal loads don't flash it. After ~15 s the request times out
 * and the screen shows its error state with a "Retry" button.
 */
export function ServerWaking({ loading }: { loading: boolean }) {
  const theme = useTheme();
  const show = useDelayedFlag(loading, WAKING_HINT_AFTER_MS);
  if (!show) return null;
  return (
    <Card>
      <View
        style={styles.row}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel="Waking up server. The free server sleeps when idle, so the first load can take up to a minute."
      >
        <ActivityIndicator color={theme.colors.accent} />
        <View style={styles.text}>
          <Text variant="bodyStrong">Waking up server…</Text>
          <Text variant="caption" color="secondary">
            The free server sleeps when idle, so the first load can take up to a minute.
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  text: { flex: 1, gap: 2 },
});
