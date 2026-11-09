import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Screen,
  SegmentedControl,
  Text,
  useToast,
  type IconName,
  type SegmentOption,
} from '@/components/ui';
import { DEFAULT_API_URL } from '@/constants/config';
import { useMockStore, type PreviewScenario } from '@/store/mockStore';
import { useTheme } from '@/theme';

const SCENARIOS: readonly SegmentOption<PreviewScenario>[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'loading', label: 'Loading' },
  { value: 'offline', label: 'Offline', accessibilityLabel: 'Device offline' },
  { value: 'error', label: 'Error', accessibilityLabel: 'Backend unreachable' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const scenario = useMockStore((s) => s.scenario);
  const setScenario = useMockStore((s) => s.setScenario);
  const resetAlerts = useMockStore((s) => s.resetAlerts);

  return (
    <Screen title="Settings">
      <Section title="Connection">
        <Row
          icon="server-outline"
          label="Backend address"
          value={DEFAULT_API_URL ?? 'Not set (mobile/.env)'}
        />
        <Text variant="caption" color="tertiary">
          Your laptop&apos;s LAN IP and port 4000. Editable here in the networking phase.
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
          Temporary: shows every screen in another state using mock data.
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
      <View style={styles.rowText}>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 },
  rowText: { flex: 1, gap: 2 },
});
