import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';

interface SectionHeaderProps {
  /** Small UPPERCASE letter-spaced muted label. */
  eyebrow?: string;
  title?: string;
  /** Right-aligned meta text or node (e.g. "Asia/Manila", "View all"). */
  right?: ReactNode;
  /** Eyebrow color override (e.g. purple for the dev demo tools). */
  eyebrowTint?: string;
  style?: StyleProp<ViewStyle>;
}

/** The prototype's header pattern: EYEBROW over a larger title, optional meta at the right. */
export function SectionHeader({ eyebrow, title, right, eyebrowTint, style }: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.text}>
        {eyebrow ? <Eyebrow tint={eyebrowTint}>{eyebrow}</Eyebrow> : null}
        {title ? (
          <Text variant="sectionTitle" accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
        ) : null}
      </View>
      {typeof right === 'string' ? (
        <Text variant="caption" color="secondary" numberOfLines={1} style={styles.right}>
          {right}
        </Text>
      ) : right ? (
        <View style={styles.right}>{right}</View>
      ) : null}
    </View>
  );
}

export function Eyebrow({ children, tint }: { children: string; tint?: string }) {
  return (
    <Text variant="eyebrow" color="secondary" tint={tint} numberOfLines={1}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  text: { flex: 1, gap: 4 },
  right: { flexShrink: 0, marginBottom: 2 },
});
