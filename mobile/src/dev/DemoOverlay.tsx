import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { selectDemoActive, useDemoStore } from '@/store/demoStore';

import { DemoSheet } from './DemoSheet';

/**
 * The dark "Demo" pill at the top right of every screen, and the "Presentation
 * tools" sheet it opens. Loaded only in development builds or with
 * EXPO_PUBLIC_DEMO=1 (see app/_layout.tsx): release builds don't contain it.
 */
export default function DemoOverlay() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const active = useDemoStore(selectDemoActive);

  return (
    <>
      <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 4 }]}>
        <Button
          label={active ? 'Demo •' : 'Demo'}
          variant="inverse"
          size="small"
          onPress={() => setOpen(true)}
          accessibilityLabel={active ? 'Demo tools, overrides active' : 'Demo tools'}
          accessibilityHint="Opens the presentation tools (development only)"
        />
      </View>
      <DemoSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', right: 16, alignItems: 'flex-end' },
});
