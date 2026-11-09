import { toAlertDto } from '../domain/dto.js';
import { ALERT_METRICS, SeveritySchema, type AlertMetric } from '../domain/schemas.js';
import type { Device, Reading, Thresholds } from '../generated/prisma/client.js';
import { createLogger } from '../lib/logger.js';
import type { Realtime } from '../realtime/socket.js';
import { insertAlert, latestMetricAlerts, type NewAlert } from '../services/alerts.js';
import { getThresholds } from '../services/thresholds.js';
import { EMPTY_STATE, evaluateMetric, type MetricState, type RuleAlert } from './thresholdRule.js';

const log = createLogger('rules');

const LABEL: Record<AlertMetric, { name: string; unit: string; decimals: number }> = {
  airTemp: { name: 'Air temperature', unit: ' °C', decimals: 1 },
  humidity: { name: 'Humidity', unit: ' %', decimals: 1 },
  soilMoisture: { name: 'Soil moisture', unit: ' %', decimals: 1 },
  lux: { name: 'Light', unit: ' lx', decimals: 0 },
};

const LIMITS: Record<AlertMetric, (t: Thresholds) => [number | null, number | null]> = {
  airTemp: (t) => [t.airTempMin, t.airTempMax],
  humidity: (t) => [t.humidityMin, t.humidityMax],
  soilMoisture: (t) => [t.soilMoistureMin, t.soilMoistureMax],
  lux: (t) => [t.luxMin, t.luxMax],
};

/** Rounded to the metric's decimals, without a trailing ".0" (35 °C, 35.2 °C, 39.8 %). */
function fmt(metric: AlertMetric, v: number): string {
  const l = LABEL[metric];
  return `${String(Number(v.toFixed(l.decimals)))}${l.unit}`;
}

function messageFor(metric: AlertMetric, a: RuleAlert, value: number): string {
  const { name } = LABEL[metric];
  if (a.type === 'recovered') return `${name} back in range: ${fmt(metric, value)}`;
  const very = a.severity === 'critical' ? 'very ' : '';
  const word = a.type === 'above_max' ? 'high' : 'low';
  const limitText =
    a.limit === null ? '' : ` (${a.type === 'above_max' ? 'max' : 'min'} ${fmt(metric, a.limit)})`;
  return `${name} ${very}${word}: ${fmt(metric, value)}${limitText}`;
}

export interface RulesEngine {
  /** Check a stored reading against the device's thresholds. */
  evaluateReading(device: Device, reading: Reading): Promise<void>;
  /** Called once per online→offline transition. */
  deviceWentOffline(device: Device, reason: string): Promise<void>;
  /** Called once per offline→online transition (not for newly created devices). */
  deviceCameOnline(device: Device): Promise<void>;
}

export function createRulesEngine(opts: { realtime: Realtime; cooldownMs: number }): RulesEngine {
  const { realtime, cooldownMs } = opts;
  const states = new Map<string, MetricState>();

  async function raise(alert: NewAlert): Promise<void> {
    const saved = await insertAlert(alert);
    log.info(`[${saved.severity}] ${saved.deviceId}: ${saved.message}`);
    realtime.emitAlert(toAlertDto(saved));
  }

  /** In-memory state, restored from the alert table after a restart. */
  async function loadState(deviceId: string, metric: AlertMetric): Promise<MetricState> {
    const key = `${deviceId}:${metric}`;
    const cached = states.get(key);
    if (cached) return cached;

    const { breach, recovered } = await latestMetricAlerts(deviceId, metric);
    let state: MetricState = EMPTY_STATE;
    if (breach) {
      const severity = SeveritySchema.parse(breach.severity);
      const open = !recovered || recovered.id < breach.id;
      state = {
        episode: open
          ? {
              direction: breach.type === 'below_min' ? 'below_min' : 'above_max',
              announcedSeverity: severity,
            }
          : null,
        lastBreachAlertAt: breach.ts.getTime(),
        lastBreachAlertSeverity: severity,
      };
    }
    states.set(key, state);
    return state;
  }

  return {
    async evaluateReading(device, reading) {
      const thresholds = await getThresholds(device.id);
      const now = Date.now();
      for (const metric of ALERT_METRICS) {
        const value = reading[metric];
        if (value === null) continue; // sensor failure: keep the current state
        const [min, max] = LIMITS[metric](thresholds);
        const state = await loadState(device.id, metric);
        const result = evaluateMetric(metric, value, min, max, state, now, cooldownMs);
        states.set(`${device.id}:${metric}`, result.next);
        if (result.alert) {
          await raise({
            deviceId: device.id,
            type: result.alert.type,
            severity: result.alert.severity,
            metric,
            value,
            message: messageFor(metric, result.alert, value),
          });
        }
      }
    },

    async deviceWentOffline(device, reason) {
      await raise({
        deviceId: device.id,
        type: 'offline',
        severity: 'warning',
        metric: null,
        value: null,
        message: `${device.name} went offline (${reason})`,
      });
    },

    async deviceCameOnline(device) {
      await raise({
        deviceId: device.id,
        type: 'online',
        severity: 'info',
        metric: null,
        value: null,
        message: `${device.name} is back online`,
      });
    },
  };
}
