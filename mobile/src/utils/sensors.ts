import type { StatusTone } from '@/theme';
import type { AlertMetric, Thresholds } from '@/types/api';

export interface MetricMeta {
  label: string;
  unit: string;
  decimals: number;
  /** MaterialCommunityIcons name. */
  icon: 'thermometer' | 'water-percent' | 'sprout' | 'white-balance-sunny';
  /** How far past a limit counts as critical (same margins as the backend rules). */
  criticalMargin: (limit: number) => number;
}

export const METRICS: Record<AlertMetric, MetricMeta> = {
  airTemp: {
    label: 'Air temperature',
    unit: '°C',
    decimals: 1,
    icon: 'thermometer',
    criticalMargin: () => 3,
  },
  humidity: {
    label: 'Humidity',
    unit: '%',
    decimals: 0,
    icon: 'water-percent',
    criticalMargin: () => 10,
  },
  soilMoisture: {
    label: 'Soil moisture',
    unit: '%',
    decimals: 0,
    icon: 'sprout',
    criticalMargin: () => 10,
  },
  lux: {
    label: 'Light',
    unit: 'lx',
    decimals: 0,
    icon: 'white-balance-sunny',
    criticalMargin: (limit) => Math.max(500, Math.abs(limit) * 0.5),
  },
};

export function limitsFor(metric: AlertMetric, t: Thresholds): [number | null, number | null] {
  switch (metric) {
    case 'airTemp':
      return [t.airTempMin, t.airTempMax];
    case 'humidity':
      return [t.humidityMin, t.humidityMax];
    case 'soilMoisture':
      return [t.soilMoistureMin, t.soilMoistureMax];
    case 'lux':
      return [t.luxMin, t.luxMax];
  }
}

export interface SensorStatus {
  tone: StatusTone;
  label: string;
}

/** Display status of a value against its limits. Mirrors the backend rules (contract §5). */
export function sensorStatus(
  metric: AlertMetric,
  value: number | null,
  min: number | null,
  max: number | null,
  deviceOnline: boolean,
): SensorStatus {
  if (!deviceOnline) return { tone: 'offline', label: 'Offline' };
  if (value === null) return { tone: 'danger', label: 'Sensor error' };
  const margin = METRICS[metric].criticalMargin;
  if (max !== null && value > max) {
    return value - max >= margin(max)
      ? { tone: 'danger', label: 'Very high' }
      : { tone: 'warning', label: 'High' };
  }
  if (min !== null && value < min) {
    return min - value >= margin(min)
      ? { tone: 'danger', label: 'Very low' }
      : { tone: 'warning', label: 'Low' };
  }
  return { tone: 'ok', label: 'Normal' };
}

const numberFormats = new Map<number, Intl.NumberFormat>();

/** Locale-aware number with fixed decimals; "—" for null. */
export function formatValue(value: number | null, decimals: number): string {
  if (value === null) return '—';
  let fmt = numberFormats.get(decimals);
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    numberFormats.set(decimals, fmt);
  }
  return fmt.format(value);
}

/** "15–35 °C", "≥ 30 %", "≤ 85 %" or null when no limits are set. */
export function formatRange(
  min: number | null,
  max: number | null,
  unit: string,
  decimals = 0,
): string | null {
  if (min !== null && max !== null)
    return `${formatValue(min, decimals)}–${formatValue(max, decimals)} ${unit}`;
  if (min !== null) return `≥ ${formatValue(min, decimals)} ${unit}`;
  if (max !== null) return `≤ ${formatValue(max, decimals)} ${unit}`;
  return null;
}
