import Ionicons from '@expo/vector-icons/Ionicons';
import type { ErrorBoundaryProps } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { ApiError, describeError, errorTitle } from '@/services/api';
import { useTheme } from '@/theme';

/**
 * Shown instead of the app when rendering crashes (exported as `ErrorBoundary`
 * from app/_layout.tsx). Runs outside the app's providers, so it only uses the
 * system theme. "Reload" re-mounts the app; saved data is kept.
 */
export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const theme = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.icon, { backgroundColor: theme.colors.dangerSoft }]}>
          <Ionicons name="warning-outline" size={32} color={theme.colors.danger} />
        </View>
        <Text variant="title" style={styles.center} accessibilityRole="header">
          {errorTitle(error)}
        </Text>
        <Text color="secondary" style={styles.center}>
          The app hit an unexpected problem. Your greenhouse is not affected: the fan keeps running
          on its own and alerts still arrive as notifications.
        </Text>
        {error instanceof ApiError ? (
          <Text color="secondary" style={styles.center}>
            {describeError(error)}
          </Text>
        ) : null}
        <Button label="Reload" icon="refresh" onPress={() => void retry()} />
        {__DEV__ ? (
          <Text variant="caption" color="tertiary" selectable style={styles.dev}>
            {error.name}: {error.message}
            {'\n'}
            {error.stack?.split('\n').slice(0, 8).join('\n')}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14, alignItems: 'center' },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  dev: { alignSelf: 'stretch', marginTop: 12, fontFamily: 'monospace' },
});
