import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Button, type IconName } from './Button';
import { Text } from './Text';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { padding: theme.spacing.xl }]}>
      <View
        style={[styles.iconWrap, { backgroundColor: theme.colors.surfaceMuted }]}
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons name={icon} size={28} color={theme.colors.textSecondary} />
      </View>
      <Text variant="heading" style={styles.center} accessibilityRole="header">
        {title}
      </Text>
      {message ? (
        <Text color="secondary" style={styles.center}>
          {message}
        </Text>
      ) : null}
      {action ? <Button label={action.label} onPress={action.onPress} variant="secondary" /> : null}
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
