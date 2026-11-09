import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retrying = false,
}: ErrorStateProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.container, { padding: theme.spacing.xl }]}
      accessibilityLiveRegion="polite"
    >
      <View
        style={[styles.iconWrap, { backgroundColor: theme.colors.dangerSoft }]}
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons name="cloud-offline-outline" size={28} color={theme.colors.danger} />
      </View>
      <Text variant="heading" style={styles.center} accessibilityRole="header">
        {title}
      </Text>
      <Text color="secondary" style={styles.center}>
        {message}
      </Text>
      {onRetry ? (
        <Button label="Try again" icon="refresh" onPress={onRetry} loading={retrying} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  center: { textAlign: 'center' },
});
