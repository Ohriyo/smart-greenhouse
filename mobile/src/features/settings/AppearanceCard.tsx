import Constants from 'expo-constants';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemePreview } from '@/components/greenhouse';
import {
  BottomSheet,
  Button,
  Card,
  Divider,
  ListRow,
  SegmentedControl,
  Text,
  type SegmentOption,
} from '@/components/ui';
import { useSettingsStore, type ThemePreference } from '@/store/settingsStore';

const THEME_OPTIONS: readonly SegmentOption<ThemePreference>[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System', accessibilityLabel: 'Follow the phone’s setting' },
];

/** From app.config.ts (version, android.versionCode), so it can't drift from the build. */
function appVersion(): { version: string; build: string; packageName: string } {
  const config = Constants.expoConfig;
  return {
    version: config?.version ?? '—',
    build: String(config?.android?.versionCode ?? 1),
    packageName: config?.android?.package ?? '—',
  };
}

/** "APPEARANCE": Light / Dark / System with previews, temperature unit, and About. */
export function AppearanceCard() {
  const preference = useSettingsStore((s) => s.themePreference);
  const setPreference = useSettingsStore((s) => s.setThemePreference);
  const [about, setAbout] = useState(false);
  const { version, build, packageName } = appVersion();

  return (
    <>
      <Card>
        <SegmentedControl
          options={THEME_OPTIONS}
          value={preference}
          onChange={setPreference}
          accessibilityLabel="Theme"
        />
        <View
          style={styles.previews}
          accessibilityRole="radiogroup"
          accessibilityLabel="Theme previews"
        >
          <ThemePreview
            scheme="light"
            selected={preference === 'light'}
            onPress={() => setPreference('light')}
          />
          <ThemePreview
            scheme="dark"
            selected={preference === 'dark'}
            onPress={() => setPreference('dark')}
          />
        </View>
      </Card>

      <Card>
        <ListRow
          title="Temperature units"
          subtitle="Celsius only"
          trailing={
            <Text variant="bodyStrong" accessibilityLabel="Celsius">
              °C
            </Text>
          }
        />
        <Divider />
        <ListRow
          title="About ETanim"
          subtitle={`Version ${version} · Build ${build}`}
          onPress={() => setAbout(true)}
        />
      </Card>

      <BottomSheet visible={about} onClose={() => setAbout(false)} eyebrow="About" title="ETanim">
        <Text color="secondary">
          Monitors and controls your ESP32 greenhouse over your home network: live readings,
          history, alerts and the ventilation fan.
        </Text>
        <View style={styles.facts}>
          <Fact label="Version" value={version} />
          <Fact label="Build" value={build} />
          <Fact label="Android package" value={packageName} />
        </View>
        <Button label="Close" variant="secondary" fullWidth onPress={() => setAbout(false)} />
      </BottomSheet>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <Text variant="bodyStrong" selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  previews: { flexDirection: 'row', gap: 12, marginTop: 14 },
  facts: { gap: 10, paddingVertical: 4 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
});
