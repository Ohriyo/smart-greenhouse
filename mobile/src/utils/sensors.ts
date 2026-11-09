import type { IconName } from '@/components/ui/Icon';
import type { Liveness } from '@/store/liveStore';
import type { ColorTokens, StatusTone } from '@/theme';
import type { AlertMetric, Thresholds } from '@/types/api';

export interface MetricMeta {
  label: string;
  unit: string;
  decimals: number;
  /** Short label for chips ("Temp"). */
  short: string;
  icon: IconName;
  /** Key of the metric's chart color in the theme. */
  colorKey: keyof ColorTokens['chart'];
  /** How far past a limit counts as critical (same margins as the backend rules). */
  criticalMargin: (limit: number) => number;
}

export const METRICS: Record<AlertMetric, MetricMeta> = {
  airTemp: {
    label: 'Air temperature',
    short: 'Temp',
    unit: '°C',
    decimals: 1,
    icon: 'mci-thermometer',
    colorKey: 'airTemp',
    criticalMargin: () => 3,
  },
  humidity: {
    label: 'Humidity',
    short: 'Humidity',
    unit: '%',
    decimals: 1,
    icon: 'mci-water-outline',
    colorKey: 'humidity',
    criticalMargin: () => 10,
  },
  soilMoisture: {
    label: 'Soil moisture',
    short: 'Soil',
    unit: '%',
    decimals: 1,
    icon: 'mci-sprout-outline',
    colorKey: 'soilMoisture',
    criticalMargin: () => 10,
  },
  lux: {
    label: 'Light',
    short: 'Light',
    unit: 'lx',
    decimals: 0,
    icon: 'mci-white-balance-sunny',
    colorKey: 'lux',
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

/**
 * Display status of a value against its limits. Mirrors the backend rules
 * (contract §5). Values that aren't live never claim "Normal"/"High".
 */
export function sensorStatus(
  metric: AlertMetric,
  value: number | null,
  min: number | null,
  max: number | null,
  liveness: Liveness,
): SensorStatus {
  if (liveness === 'offline') return { tone: 'offline', label: 'Offline' };
  if (liveness === 'stale') return { tone: 'offline', label: 'Last known' };
  if (value === null) return { tone: 'danger', label: 'Sensor error' };
  const margin = METRICS[metric].criticalMargin;
  if (max !== null && value > max) {
    return value - max >= margin(max)
      ? { tone: 'danger', label: 'Critical' }
      : { tone: 'warning', label: 'High' };
  }
  if (min !== null && value < min) {
    return min - value >= margin(min)
      ? { tone: 'danger', label: 'Critical' }
      : { tone: 'warning', label: 'Low' };
  }
  return { tone: 'ok', label: 'Good' };
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

/**
 * Value + unit for display: "30.9" + "°C"; light ≥ 1000 lx as "27" + "k lux".
 * `spoken` is the full TalkBack text ("27 thousand lux").
 */
export function formatMetric(
  metric: AlertMetric,
  value: number | null,
): { value: string; unit: string; spoken: string } {
  const meta = METRICS[metric];
  if (value === null) return { value: '—', unit: '', spoken: 'no reading' };
  if (metric === 'lux') {
    if (value >= 1000) {
      const k = value / 1000;
      const text = formatValue(k, k < 10 ? 1 : 0);
      return { value: text, unit: 'k lux', spoken: `${text} thousand lux` };
    }
    const text = formatValue(value, 0);
    return { value: text, unit: 'lux', spoken: `${text} lux` };
  }
  const text = formatValue(value, meta.decimals);
  const spokenUnit = metric === 'airTemp' ? 'degrees Celsius' : 'percent';
  return { value: text, unit: meta.unit, spoken: `${text} ${spokenUnit}` };
}

/** Short axis label: 36°, 60%, 27k. */
export function formatAxis(metric: AlertMetric, value: number): string {
  if (metric === 'lux')
    return value >= 1000
      ? `${formatValue(value / 1000, value < 10_000 ? 1 : 0)}k`
      : formatValue(value, 0);
  return `${formatValue(value, Math.abs(value) < 10 && value % 1 !== 0 ? 1 : 0)}${metric === 'airTemp' ? '°' : '%'}`;
}

/** One string with its unit, as in the prototype: "33.1 °C", "28%", "27 k lux". */
export function formatMetricText(metric: AlertMetric, value: number | null): string {
  const f = formatMetric(metric, value);
  if (value === null) return f.value;
  return f.unit === '%' ? `${f.value}%` : `${f.value} ${f.unit}`;
}
