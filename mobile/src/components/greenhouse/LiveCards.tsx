import { memo } from 'react';

import { useLiveStore } from '@/store/liveStore';
import type { AlertMetric } from '@/types/api';
import { sensorStatus } from '@/utils/sensors';

import { FanStatusCard } from './FanStatusCard';
import { SensorCard } from './SensorCard';
import { UpdatedAgo } from './UpdatedAgo';

interface LiveSensorCardProps {
  deviceId: string;
  metric: AlertMetric;
  min: number | null;
  max: number | null;
  onPress?: (metric: AlertMetric) => void;
}

/**
 * Sensor card bound to the live store. It selects only its own value and the
 * device's online flag (primitives), so a telemetry message re-renders just the
 * cards whose value actually changed.
 */
export const LiveSensorCard = memo(function LiveSensorCard({
  deviceId,
  metric,
  min,
  max,
  onPress,
}: LiveSensorCardProps) {
  const value = useLiveStore((s) => s.readings[deviceId]?.[metric] ?? null);
  const online = useLiveStore((s) => s.devices[deviceId]?.online ?? false);

  return (
    <SensorCard
      metric={metric}
      value={value}
      min={min}
      max={max}
      status={sensorStatus(metric, value, min, max, online)}
      footer={<UpdatedAgo deviceId={deviceId} />}
      onPress={onPress ? () => onPress(metric) : undefined}
    />
  );
});

interface LiveFanCardProps {
  deviceId: string;
  fanOnTemp: number;
  fanOffTemp: number;
  onPress?: () => void;
}

/** Fan card bound to the live store (confirmed fan state from telemetry/fan:state). */
export const LiveFanCard = memo(function LiveFanCard({
  deviceId,
  fanOnTemp,
  fanOffTemp,
  onPress,
}: LiveFanCardProps) {
  const fanOn = useLiveStore((s) => s.readings[deviceId]?.fanOn ?? false);
  const fanMode = useLiveStore((s) => s.readings[deviceId]?.fanMode ?? 'auto');
  const online = useLiveStore((s) => s.devices[deviceId]?.online ?? false);

  return (
    <FanStatusCard
      fanOn={fanOn}
      fanMode={fanMode}
      fanOnTemp={fanOnTemp}
      fanOffTemp={fanOffTemp}
      deviceOnline={online}
      onPress={onPress}
    />
  );
});
