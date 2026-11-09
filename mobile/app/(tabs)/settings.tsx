import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, SectionHeader } from '@/components/ui';
import { AppearanceCard } from '@/features/settings/AppearanceCard';
import { DeviceCard } from '@/features/settings/DeviceCard';
import { NotificationsSection } from '@/features/settings/NotificationsCard';
import { ServerCard } from '@/features/settings/ServerCard';
import { SmsSection } from '@/features/settings/SmsCard';

/** Settings: server connection, device, notifications, SMS alerts, appearance. */
export default function SettingsScreen() {
  return (
    <Screen title="Settings" subtitle="Connections and preferences">
      <Group eyebrow="Server connection">
        <ServerCard />
      </Group>
      <Group eyebrow="Device">
        <DeviceCard />
      </Group>
      <Group eyebrow="Notifications">
        <NotificationsSection />
      </Group>
      <Group eyebrow="SMS alerts">
        <SmsSection />
      </Group>
      <Group eyebrow="Appearance">
        <AppearanceCard />
      </Group>
      {__DEV__ ? <DevGalleryLink /> : null}
    </Screen>
  );
}

/** A small UPPERCASE label above its card(s), as in the prototype. */
function Group({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <SectionHeader eyebrow={eyebrow} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 10 },
});

/** DEV ONLY: opens the component gallery. */
function DevGalleryLink() {
  const router = useRouter();
  return (
    <Button
      label="Component gallery (dev)"
      icon="color-palette-outline"
      variant="tonal"
      fullWidth
      onPress={() => router.push('/dev-gallery')}
    />
  );
}
