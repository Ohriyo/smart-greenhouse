import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Eyebrow, IconTile, Text } from '@/components/ui';
import { toneColors, useTheme } from '@/theme';

import type { GreenhouseSummary } from './greenhouseStatus';

interface StatusCardProps {
  summary: GreenhouseSummary;
}

/** "GREENHOUSE STATUS / Everything looks good". */
export const StatusCard = memo(function StatusCard({ summary }: StatusCardProps) {
  const theme = useTheme();
  const tone = toneColors(theme, summary.tone);
  const good = summary.tone === 'ok';

  return (
    <Card
      tone={good ? 'tint' : 'default'}
      style={good ? null : { backgroundColor: tone.bg, borderColor: tone.bg }}
      accessibilityLabel={`Greenhouse status: ${summary.title}. ${summary.message}`}
    >
      <View style={styles.top}>
        <IconTile
          icon={summary.icon}
          tone={summary.tone === 'neutral' ? 'offline' : summary.tone}
          solid
          size={40}
        />
        <View style={styles.text}>
          <Eyebrow tint={tone.fg}>Greenhouse status</Eyebrow>
          <Text variant="sectionTitle">{summary.title}</Text>
          <Text variant="caption" color="secondary" style={styles.message}>
            {summary.message}
          </Text>
        </View>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  text: { flex: 1, gap: 2 },
  message: { marginTop: 4 },
});
