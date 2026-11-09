import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Divider, Eyebrow, IconTile, Text } from '@/components/ui';
import { toneColors, useTheme } from '@/theme';
import type { FanMode } from '@/types/api';

import type { GreenhouseSummary } from './greenhouseStatus';

const MODE: Record<FanMode, string> = { auto: 'Auto', on: 'On', off: 'Off' };

interface StatusCardProps {
  summary: GreenhouseSummary;
  fanOn: boolean | null;
  fanMode: FanMode | null;
}

/** "GREENHOUSE STATUS / Everything looks good" + FAN row "ON · Auto". */
export const StatusCard = memo(function StatusCard({ summary, fanOn, fanMode }: StatusCardProps) {
  const theme = useTheme();
  const { colors } = theme;
  const tone = toneColors(theme, summary.tone);
  const good = summary.tone === 'ok';
  const fanText =
    fanOn === null || fanMode === null ? '—' : `${fanOn ? 'ON' : 'OFF'} · ${MODE[fanMode]}`;
  const spokenFan =
    fanOn === null || fanMode === null
      ? 'unknown'
      : `${fanOn ? 'on' : 'off'}, mode ${MODE[fanMode]}`;

  return (
    <Card
      tone={good ? 'tint' : 'default'}
      style={good ? null : { backgroundColor: tone.bg, borderColor: tone.bg }}
      accessibilityLabel={`Greenhouse status: ${summary.title}. ${summary.message}. Fan ${spokenFan}`}
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
      <Divider
        style={[styles.divider, { backgroundColor: good ? colors.accentSoft : colors.border }]}
      />
      <View style={styles.fanRow}>
        <IconTile icon="mci-fan" solid size={30} />
        <Eyebrow>Fan</Eyebrow>
        <Text variant="bodyStrong" style={styles.fanValue}>
          {fanText}
        </Text>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  text: { flex: 1, gap: 2 },
  message: { marginTop: 4 },
  divider: { marginVertical: 14 },
  fanRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fanValue: { marginLeft: 'auto' },
});
