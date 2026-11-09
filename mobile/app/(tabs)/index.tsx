import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ScreenPlaceholder } from '@/components/ui/ScreenPlaceholder';
import { DEFAULT_API_URL } from '@/constants/config';
import { HealthSchema, type Health } from '@/types/api';

/** Setup check only: the real API client (fetch wrapper) comes in a later phase. */
async function fetchHealth(baseUrl: string): Promise<Health> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
    const json: unknown = await res.json();
    return HealthSchema.parse(json);
  } finally {
    clearTimeout(timer);
  }
}

export default function DashboardScreen() {
  const health = useQuery({
    queryKey: ['health', DEFAULT_API_URL],
    queryFn: () => fetchHealth(DEFAULT_API_URL ?? ''),
    enabled: false, // only when the button is pressed
    retry: false,
  });

  let result = 'Not checked yet.';
  if (health.isFetching) result = 'Checking…';
  else if (health.isError) result = `❌ ${health.error.message}`;
  else if (health.data)
    result = `✅ Backend ${health.data.status} · DB ${health.data.db} · MQTT ${health.data.mqtt}`;

  return (
    <ScreenPlaceholder
      title="Dashboard"
      description="Phase 3 setup screen. Live greenhouse data comes in a later phase."
    >
      <Text style={styles.label}>API URL: {DEFAULT_API_URL ?? 'not set (see mobile/.env)'}</Text>
      <Pressable
        accessibilityRole="button"
        style={[styles.button, !DEFAULT_API_URL && styles.buttonDisabled]}
        disabled={!DEFAULT_API_URL || health.isFetching}
        onPress={() => void health.refetch()}
      >
        <Text style={styles.buttonText}>Check backend</Text>
      </Pressable>
      <Text style={styles.result}>{result}</Text>
    </ScreenPlaceholder>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, color: '#1B3A1D' },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#2E7D32',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  result: { fontSize: 15, color: '#1B3A1D' },
});
