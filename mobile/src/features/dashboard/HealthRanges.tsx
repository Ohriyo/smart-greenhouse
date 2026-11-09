import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, RadialGauge, StatusPill, Text } from '@/components/ui';
import { useLiveStore } from '@/store/liveStore';
import { useTheme } from '@/theme';
import type { Thresholds } from '@/types/api';
import { formatValue } from '@/utils/sensors';

import { soilCaption, tempCaption } from './greenhouseStatus';

/** Fixed gauge scale for air temperature (prototype: 20° … 40°). */
const TEMP_MIN = 20;
const TEMP_MAX = 40;

/** "HEALTH RANGES / At a glance": soil moisture + air temperature gauges with the optimal zones. */
export const HealthRanges = memo(function HealthRanges({
  deviceId,
  thresholds,
}: {
  deviceId: string;
  thresholds: Thresholds | undefined;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const soil = useLiveStore((s) => s.readings[deviceId]?.soilMoisture ?? null);
  const temp = useLiveStore((s) => s.readings[deviceId]?.airTemp ?? null);

  const soilMin = thresholds?.soilMoistureMin ?? null;
  const soilMax = thresholds?.soilMoistureMax ?? null;
  const tempMin = thresholds?.airTempMin ?? null;
  const fanOn = thresholds?.fanOnTemp ?? 32;
  const fanOff = thresholds?.fanOffTemp ?? 28;
  const soilText = soil === null ? '—' : `${formatValue(soil, 0)}%`;
  const tempText = temp === null ? '—' : `${formatValue(temp, 0)}°`;
  const soilCap = soilCaption(soil, soilMin, soilMax);
  const tempCap = tempCaption(temp, tempMin, fanOn);

  return (
    <Card
      eyebrow="Health ranges"
      title="At a glance"
      meta={<StatusPill tone="ok" label="Optimal zones" variant="plain" />}
    >
      <View style={styles.gauges}>
        <View style={styles.gauge}>
          <Text variant="label" style={styles.gaugeTitle}>
            Soil moisture
          </Text>
          <RadialGauge
            size={132}
            value={soil}
            min={0}
            max={100}
            zone={soilMin !== null && soilMax !== null ? [soilMin, soilMax] : null}
            color={colors.chart.soilMoisture}
            display={soilText}
            caption={soilCap}
            startLabel="Dry"
            endLabel="Wet"
            accessibilityLabel={`Soil moisture ${soil === null ? 'no reading' : `${formatValue(soil, 0)} percent`}, ${soilCap}`}
          />
        </View>
        <View style={styles.gauge}>
          <Text variant="label" style={styles.gaugeTitle}>
            Air temperature
          </Text>
          <RadialGauge
            size={132}
            value={temp}
            min={TEMP_MIN}
            max={TEMP_MAX}
            zone={[tempMin ?? TEMP_MIN, fanOn]}
            ticks={[fanOff, fanOn]}
            color={colors.chart.airTemp}
            display={tempText}
            caption={tempCap}
            startLabel={`${TEMP_MIN}°`}
            endLabel={`${TEMP_MAX}°`}
            accessibilityLabel={`Air temperature ${temp === null ? 'no reading' : `${formatValue(temp, 1)} degrees`}, ${tempCap}. Fan turns off at ${fanOff} and on at ${fanOn} degrees`}
          />
        </View>
      </View>
      <View
        style={[styles.legend, { borderTopColor: colors.border }]}
        importantForAccessibility="no-hide-descendants"
      >
        <StatusPill tone="ok" label="Fan thresholds" variant="plain" />
        <Text variant="caption" color="secondary">
          OFF {formatValue(fanOff, fanOff % 1 ? 1 : 0)}°
        </Text>
        <View style={[styles.dot, { backgroundColor: colors.chart.airTemp }]} />
        <Text variant="caption" color="secondary">
          ON {formatValue(fanOn, fanOn % 1 ? 1 : 0)}°
        </Text>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  gauges: { flexDirection: 'row', justifyContent: 'space-around', gap: 8 },
  gauge: { alignItems: 'center', gap: 4, flex: 1 },
  gaugeTitle: { textAlign: 'center' },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 7, height: 7, borderRadius: 4, marginLeft: 4 },
});
