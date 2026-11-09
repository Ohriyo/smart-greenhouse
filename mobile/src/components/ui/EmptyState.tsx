import { StyleSheet, View } from 'react-native';

import { type StatusTone } from '@/theme';

import { Button } from './Button';
import type { IconName } from './Icon';
import { IconTile } from './IconTile';
import { Text } from './Text';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  message?: string;
  tone?: StatusTone;
  action?: { label: string; onPress: () => void };
}

/** "No alerts — your greenhouse is happy". */
export function EmptyState({ icon, title, message, tone = 'accent', action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <IconTile icon={icon} tone={tone} size={56} shape="circle" />
      <Text variant="heading" style={styles.center} accessibilityRole="header">
        {title}
      </Text>
      {message ? (
        <Text color="secondary" style={styles.center}>
          {message}
        </Text>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant="secondary"
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
