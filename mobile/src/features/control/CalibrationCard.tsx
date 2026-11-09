import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Text } from '@/components/ui';
import { useIsLive } from '@/features/dashboard/useLiveness';
import { useLiveStore } from '@/store/liveStore';
import { useTheme } from '@/theme';
import type { SoilPoint } from '@/types/api';
import { formatValue } from '@/utils/sensors';

import { useCalibrateSoil } from './useCalibrateSoil';

/** The dry point must sit well above the wet point (capacitive sensors read lower when wetter). */
const MIN_SPAN_MV = 200;

const COPY: Record<SoilPoint, { label: string; caption: string; spoken: string }> = {
  dry: { label: 'Capture dry value', caption: '0 %', spoken: 'dry' },
  wet: { label: 'Capture wet value', caption: '100 %', spoken: 'wet' },
};

/**
 * "SOIL SENSOR / Moisture calibration · 40% now". Each pill stores the sensor's
 * current reading on the greenhouse as the dry (0 %) or wet (100 %) point, and
 * the value beside it is what the greenhouse reports using (in mV).
 */
export const CalibrationCard = memo(function CalibrationCard({ deviceId }: { deviceId: string }) {
  const theme = useTheme();
  const { colors } = theme;
  const dry = useLiveStore((s) => s.devices[deviceId]?.soilDryMv ?? null);
  const wet = useLiveStore((s) => s.devices[deviceId]?.soilWetMv ?? null);
  const soil = useLiveStore((s) => s.readings[deviceId]?.soilMoisture ?? null);
  const live = useIsLive(deviceId);
  const { capture, pendingPoint } = useCalibrateSoil(deviceId);

  const calibrated = dry !== null && wet !== null;
  const valid = calibrated && dry - wet >= MIN_SPAN_MV;

  return (
    <Card
      eyebrow="Soil sensor"
      title="Moisture calibration"
      meta={soil === null ? 'No reading' : `${formatValue(soil, 0)}% now`}
    >
      <Text variant="caption" color="secondary">
        Hold the probe in the air for the dry value, then put it in a glass of water up to the line
        (not above) for the wet value. Capture each when the reading is steady.
      </Text>

      <View style={styles.rows}>
        {(['dry', 'wet'] as const).map((point) => {
          const value = point === 'dry' ? dry : wet;
          const copy = COPY[point];
          return (
            <View key={point} style={styles.row}>
              <Button
                label={copy.label}
                variant={point === 'dry' ? 'secondary' : 'tonal'}
                loading={pendingPoint === point}
                disabled={!live || pendingPoint !== null}
                onPress={() => capture(point)}
                accessibilityLabel={`${copy.label}${value === null ? '' : `, currently ${value} millivolts`}`}
                accessibilityHint={
                  live
                    ? 'Stores the sensor reading now'
                    : 'Unavailable while the greenhouse is offline'
                }
              />
              <View
                style={styles.value}
                accessible
                accessibilityLabel={
                  value === null
                    ? `${copy.spoken} value not reported yet`
                    : `${copy.spoken} value ${value} millivolts`
                }
              >
                <Text variant="value" tabular>
                  {value === null ? '—' : String(value)}
                </Text>
                <Text variant="micro" color="secondary">
                  mV · {copy.caption}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {!live ? (
        <Text variant="caption" color="secondary" style={styles.note}>
          The greenhouse is offline, so values can’t be captured right now.
        </Text>
      ) : null}

      <View style={styles.result} accessibilityLiveRegion="polite">
        {!calibrated ? (
          <Text variant="caption" color="secondary">
            Not calibrated yet: the greenhouse hasn’t reported its range.
          </Text>
        ) : valid ? (
          <>
            <Icon name="checkmark" size={16} color={colors.accent} />
            <Text variant="caption" tint={colors.accent}>
              Calibrated range: {dry}–{wet} mV
            </Text>
          </>
        ) : (
          <>
            <Icon name="warning-outline" size={16} color={colors.warning} />
            <Text variant="caption" tint={colors.warning} style={styles.flex}>
              Dry ({dry} mV) should be at least {MIN_SPAN_MV} mV above wet ({wet} mV). Capture the
              other value too.
            </Text>
          </>
        )}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  rows: { gap: 12, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  value: { alignItems: 'flex-end', minWidth: 72 },
  note: { marginTop: 10 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  flex: { flex: 1 },
});
