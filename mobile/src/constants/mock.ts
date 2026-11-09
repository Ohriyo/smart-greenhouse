/**
 * Mock data for the design phase (no networking yet). Shapes are the real API
 * types from docs/api-contract.md, so screens switch to live data unchanged.
 */
import type {
  Alert,
  Device,
  HistoryMetric,
  HistoryPoint,
  HistoryRange,
  Reading,
  Thresholds,
} from '@/types/api';

const loadedAt = Date.now();
const ago = (ms: number) => new Date(loadedAt - ms).toISOString();
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

export const mockDevice: Device = {
  id: 'gh-01',
  name: 'Greenhouse',
  online: true,
  lastSeen: ago(4 * SEC),
  createdAt: ago(14 * 24 * HOUR),
  telemetryIntervalSec: 5,
};

/** lastSeen used by the "Offline" design-preview scenario. */
export const mockOfflineLastSeen = ago(7 * MIN);

export const mockReading: Reading = {
  id: 1842,
  deviceId: 'gh-01',
  ts: ago(4 * SEC),
  airTemp: 33.4,
  humidity: 58.2,
  soilMoisture: 27,
  soilRaw: 2700,
  lux: 24_850,
  fanOn: true,
  fanMode: 'auto',
  rssi: -61,
};

export const mockThresholds: Thresholds = {
  deviceId: 'gh-01',
  fanOnTemp: 32,
  fanOffTemp: 28,
  airTempMin: 15,
  airTempMax: 35,
  humidityMin: 40,
  humidityMax: 85,
  soilMoistureMin: 30,
  soilMoistureMax: 80,
  luxMin: null,
  luxMax: null,
  updatedAt: ago(2 * 24 * HOUR),
};

export const mockAlerts: Alert[] = [
  {
    id: 12,
    deviceId: 'gh-01',
    ts: ago(6 * MIN),
    type: 'below_min',
    severity: 'warning',
    metric: 'soilMoisture',
    value: 27,
    message: 'Soil moisture low: 27 % (min 30 %)',
    readAt: null,
  },
  {
    id: 11,
    deviceId: 'gh-01',
    ts: ago(48 * MIN),
    type: 'above_max',
    severity: 'critical',
    metric: 'airTemp',
    value: 38.2,
    message: 'Air temperature very high: 38.2 °C (max 35 °C)',
    readAt: null,
  },
  {
    id: 10,
    deviceId: 'gh-01',
    ts: ago(52 * MIN),
    type: 'above_max',
    severity: 'warning',
    metric: 'airTemp',
    value: 35.3,
    message: 'Air temperature high: 35.3 °C (max 35 °C)',
    readAt: null,
  },
  {
    id: 9,
    deviceId: 'gh-01',
    ts: ago(3 * HOUR),
    type: 'online',
    severity: 'info',
    metric: null,
    value: null,
    message: 'Greenhouse is back online',
    readAt: ago(2 * HOUR),
  },
  {
    id: 8,
    deviceId: 'gh-01',
    ts: ago(3 * HOUR + 20 * MIN),
    type: 'offline',
    severity: 'warning',
    metric: null,
    value: null,
    message: 'Greenhouse went offline (Last Will or shutdown)',
    readAt: ago(2 * HOUR),
  },
  {
    id: 7,
    deviceId: 'gh-01',
    ts: ago(26 * HOUR),
    type: 'recovered',
    severity: 'info',
    metric: 'humidity',
    value: 42.5,
    message: 'Humidity back in range: 42.5 %',
    readAt: ago(25 * HOUR),
  },
  {
    id: 6,
    deviceId: 'gh-01',
    ts: ago(27 * HOUR),
    type: 'below_min',
    severity: 'warning',
    metric: 'humidity',
    value: 38.9,
    message: 'Humidity low: 38.9 % (min 40 %)',
    readAt: ago(25 * HOUR),
  },
];

// ---------- History (deterministic curves, ~200 points like the API) ----------

const RANGE_MS: Record<HistoryRange, number> = {
  '24h': 24 * HOUR,
  '7d': 7 * 24 * HOUR,
  '30d': 30 * 24 * HOUR,
};

/** Daily curve: 0 at night, 1 at 13:00. */
function daylight(t: number): number {
  const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
  return Math.max(0, Math.sin((Math.PI * (h - 6)) / 14));
}

function valueAt(metric: HistoryMetric, t: number, i: number): number {
  const d = daylight(t);
  const wobble = Math.sin(i * 1.7) * 0.5 + Math.sin(i * 0.31);
  switch (metric) {
    case 'airTemp':
      return 19 + 13 * d + wobble * 0.6;
    case 'humidity':
      return 80 - 26 * d + wobble * 1.5;
    case 'soilMoisture':
      return 30 + ((i * 7) % 45) * 0.8 + wobble; // dries, then watering jumps
    case 'lux':
      return Math.max(0, 32_000 * d * (0.8 + 0.2 * Math.sin(i * 0.9)));
    case 'soilRaw':
      return 2300 + wobble * 40;
    case 'rssi':
      return -60 + wobble * 3;
  }
}

export function mockHistory(metric: HistoryMetric, range: HistoryRange): HistoryPoint[] {
  const total = RANGE_MS[range];
  const bucketMs = Math.ceil(total / 200);
  const start = loadedAt - total;
  const points: HistoryPoint[] = [];
  for (let i = 0; i < 200; i++) {
    const t = start + i * bucketMs;
    const avg = valueAt(metric, t, i);
    const spread = Math.abs(avg) * 0.04 + 0.2;
    points.push({
      ts: new Date(t).toISOString(),
      avg: Math.round(avg * 100) / 100,
      min: Math.round((avg - spread) * 100) / 100,
      max: Math.round((avg + spread) * 100) / 100,
      count: Math.round(bucketMs / 5000),
    });
  }
  return points;
}
