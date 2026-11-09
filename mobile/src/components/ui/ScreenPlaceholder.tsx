import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  title: string;
  description: string;
  children?: ReactNode;
}

/** Temporary content for screens that are built in later phases. */
export function ScreenPlaceholder({ title, description, children }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, backgroundColor: '#F6F8F6' },
  title: { fontSize: 24, fontWeight: '700', color: '#1B3A1D' },
  description: { fontSize: 16, color: '#4A5A4B' },
});
