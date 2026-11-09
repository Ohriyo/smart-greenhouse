import { StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { IconTile } from './IconTile';
import { Text } from './Text';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}

/** Friendly error with a pill "Retry" button. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retrying = false,
}: ErrorStateProps) {
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <IconTile icon="cloud-offline-outline" tone="danger" size={56} shape="circle" />
      <Text variant="heading" style={styles.center} accessibilityRole="header">
        {title}
      </Text>
      <Text color="secondary" style={styles.center}>
        {message}
      </Text>
      {onRetry ? (
        <Button
          label="Retry"
          icon="refresh"
          variant="secondary"
          onPress={onRetry}
          loading={retrying}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  center: { textAlign: 'center' },
  action: { alignSelf: 'center', marginTop: 8 },
});
