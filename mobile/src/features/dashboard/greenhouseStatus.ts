import type { Liveness } from '@/store/liveStore';
import type { StatusTone } from '@/theme';
import type { AlertMetric, Reading, Thresholds } from '@/types/api';
import { formatMetricText, limitsFor, METRICS, sensorStatus } from '@/utils/sensors';
import { manilaTime } from '@/utils/manilaTime';

import type { IconName } from '@/components/ui/Icon';

export interface GreenhouseSummary {
  tone: StatusTone;
  icon: IconName;
  title: string;
  message: string;
}

const ORDER: AlertMetric[] = ['airTemp', 'humidity', 'soilMoisture', 'lux'];

/**
 * The status card's headline, in priority order:
 * 1. device offline → "Device offline"
 * 2. data not live (no connection / restored) → "Showing last known data"
 * 3. any metric outside its limits → "Needs attention" + which
 * 4. otherwise → "Everything looks good"
 */
export function greenhouseSummary(
  reading: Reading | undefined,
  thresholds: Thresholds | undefined,
  liveness: Liveness,
  lastSeen: string | null,
): GreenhouseSummary {
  if (liveness === 'offline') {
    return {
      tone: 'offline',
      icon: 'cloud-offline-outline',
      title: 'Device offline',
      message: lastSeen
        ? `No data since ${manilaTime(lastSeen)}. The fan keeps running on its own rules.`
        : 'The greenhouse hasn’t sent data yet.',
    };
  }
  if (liveness === 'stale') {
    return {
      tone: 'neutral',
      icon: 'time-outline',
      title: 'Showing last known data',
      message: reading
        ? `Last reading at ${manilaTime(reading.ts)}. Live values return when connected.`
        : 'Waiting for a connection to the greenhouse.',
    };
  }
  if (!reading) {
    return {
      tone: 'neutral',
      icon: 'hourglass-outline',
      title: 'Waiting for the first reading',
      message: 'The greenhouse is online; values appear within a few seconds.',
    };
  }

  const issues: string[] = [];
  let worst: StatusTone = 'ok';
  for (const metric of ORDER) {
    const value = reading[metric];
    const [min, max] = thresholds ? limitsFor(metric, thresholds) : [null, null];
    const status = sensorStatus(metric, value, min, max, liveness);
    if (status.tone === 'ok') continue;
    // A missing/broken sensor is a warning; only a value far past a limit is critical.
    if (status.tone === 'danger' && value !== null) worst = 'danger';
    else if (worst !== 'danger') worst = 'warning';
    issues.push(
      value === null
        ? `${METRICS[metric].label}: sensor error`
        : `${METRICS[metric].label} ${status.label.toLowerCase()} (${formatMetricText(metric, value)})`,
    );
  }
  if (issues.length > 0) {
    return {
      tone: worst,
      icon: 'warning-outline',
      title: 'Needs attention',
      message: issues.join(' · '),
    };
  }
  return {
    tone: 'ok',
    icon: 'checkmark',
    title: 'Everything looks good',
    message: 'Your plants are in a comfortable range.',
  };
}

/** Gauge caption for soil moisture against its limits. */
export function soilCaption(value: number | null, min: number | null, max: number | null): string {
  if (value === null) return 'No reading';
  if (min !== null && value < min) return 'Dry';
  if (max !== null && value > max) return 'Wet';
  return 'Optimal';
}

/** Gauge caption for air temperature: below the minimum is cool, above the fan ON point is hot. */
export function tempCaption(value: number | null, min: number | null, fanOnTemp: number): string {
  if (value === null) return 'No reading';
  if (min !== null && value < min) return 'Cool';
  if (value >= fanOnTemp) return 'Hot';
  return 'Comfortable';
}
