import type { IconName } from '@/components/ui/Icon';
import type { StatusTone } from '@/theme';
import type { Alert, AlertMetric } from '@/types/api';
import { formatMetricText, METRICS } from '@/utils/sensors';

const NOUN: Record<AlertMetric, string> = {
  airTemp: 'temperature',
  humidity: 'humidity',
  soilMoisture: 'Soil moisture',
  lux: 'Light',
};

/** Short title in the prototype's style: "High temperature", "Soil moisture low", "Recovered". */
export function alertTitle(alert: Alert): string {
  const m = alert.metric;
  switch (alert.type) {
    case 'above_max':
      if (m === 'airTemp' || m === 'humidity') return `High ${NOUN[m]}`;
      return m ? `${NOUN[m]} high` : 'Value high';
    case 'below_min':
      if (m === 'airTemp' || m === 'humidity') return `Low ${NOUN[m]}`;
      return m ? `${NOUN[m]} low` : 'Value low';
    case 'recovered':
      return 'Recovered';
    case 'offline':
      return 'Device offline';
    case 'online':
      return 'Back online';
  }
}

/** Icon tile + tone by type/severity: amber triangle, green check, red alert. */
export function alertVisual(alert: Alert): { icon: IconName; tone: StatusTone } {
  switch (alert.type) {
    case 'recovered':
    case 'online':
      return { icon: 'checkmark', tone: 'ok' };
    case 'offline':
      return { icon: 'alert-circle-outline', tone: 'danger' };
    case 'above_max':
    case 'below_min':
      return alert.severity === 'critical'
        ? { icon: 'alert-circle-outline', tone: 'danger' }
        : { icon: 'warning-outline', tone: 'warning' };
  }
}

/** One-line detail under the title: "32.8 °C · Above 32 °C limit", "Soil moisture returned to normal". */
export function alertDetail(alert: Alert): string {
  const m = alert.metric;
  if (m && alert.type === 'recovered') return `${METRICS[m].label} returned to normal`;
  if (m && alert.value !== null && (alert.type === 'above_max' || alert.type === 'below_min')) {
    const value = formatMetricText(m, alert.value);
    if (alert.limit === null || alert.limit === undefined) return value;
    const side = alert.type === 'above_max' ? 'Above' : 'Below';
    return `${value} · ${side} ${formatMetricText(m, alert.limit)} limit`;
  }
  return alert.message;
}

/** Color of the 3 px left edge: amber for warnings, red for critical, none otherwise. */
export function alertAccent(alert: Alert): StatusTone | null {
  if (alert.type !== 'above_max' && alert.type !== 'below_min') return null;
  return alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : null;
}

export const SEVERITY_LABEL: Record<Alert['severity'], string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

/** Which day group an alert belongs to, by Asia/Manila calendar day. */
export type AlertDay = 'Today' | 'Yesterday' | 'Earlier';
export function alertDay(ts: string, todayStart: number): AlertDay {
  const t = Date.parse(ts);
  if (t >= todayStart) return 'Today';
  if (t >= todayStart - 86_400_000) return 'Yesterday';
  return 'Earlier';
}
