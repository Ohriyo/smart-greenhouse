import type { AlertMetric, Severity } from '../domain/schemas.js';

/**
 * Pure threshold logic for one metric of one device (no I/O).
 *
 * Rules:
 * - value > max → "above_max", value < min → "below_min"; null limit = no check.
 * - severity: "critical" when beyond the limit by at least the critical margin,
 *   otherwise "warning".
 * - A breach starts an *episode*. The episode is announced (alert created) unless a
 *   breach alert for this metric was created less than `cooldownMs` ago with the
 *   same or higher severity. A silent episode is announced later once the cooldown
 *   has passed (if still breached) or its severity rises above the last alert's.
 * - During an announced episode only a severity rise creates a new alert.
 * - The episode ends when the value is back inside the limit by the deadband;
 *   a "recovered" info alert is created only if the episode was announced.
 */

export type BreachType = 'above_max' | 'below_min';

export interface Episode {
  direction: BreachType;
  /** Highest severity alerted in this episode, or null if the episode is silent. */
  announcedSeverity: Severity | null;
}

export interface MetricState {
  episode: Episode | null;
  /** Time (ms) and severity of the last breach alert for this metric (for cooldown). */
  lastBreachAlertAt: number | null;
  lastBreachAlertSeverity: Severity | null;
}

export const EMPTY_STATE: MetricState = {
  episode: null,
  lastBreachAlertAt: null,
  lastBreachAlertSeverity: null,
};

export interface RuleAlert {
  type: BreachType | 'recovered';
  severity: Severity;
  /** The limit that was crossed (for breach alerts). */
  limit: number | null;
}

export interface RuleResult {
  alert: RuleAlert | null;
  next: MetricState;
}

interface MetricTuning {
  /** How far back inside the limit the value must come before "recovered". */
  deadband: (limit: number) => number;
  /** How far beyond the limit counts as critical. */
  criticalMargin: (limit: number) => number;
}

export const METRIC_TUNING: Record<AlertMetric, MetricTuning> = {
  airTemp: { deadband: () => 0.5, criticalMargin: () => 3 },
  humidity: { deadband: () => 2, criticalMargin: () => 10 },
  soilMoisture: { deadband: () => 2, criticalMargin: () => 10 },
  lux: {
    deadband: (limit) => Math.max(50, Math.abs(limit) * 0.05),
    criticalMargin: (limit) => Math.max(500, Math.abs(limit) * 0.5),
  },
};

const RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };
const higher = (a: Severity, b: Severity | null) => b === null || RANK[a] > RANK[b];

function classify(
  metric: AlertMetric,
  value: number,
  min: number | null,
  max: number | null,
): { direction: BreachType; severity: Severity; limit: number } | null {
  const margin = METRIC_TUNING[metric].criticalMargin;
  if (max !== null && value > max) {
    return {
      direction: 'above_max',
      severity: value - max >= margin(max) ? 'critical' : 'warning',
      limit: max,
    };
  }
  if (min !== null && value < min) {
    return {
      direction: 'below_min',
      severity: min - value >= margin(min) ? 'critical' : 'warning',
      limit: min,
    };
  }
  return null;
}

function isRecovered(
  metric: AlertMetric,
  direction: BreachType,
  value: number,
  min: number | null,
  max: number | null,
): boolean {
  const db = METRIC_TUNING[metric].deadband;
  if (direction === 'above_max') return max === null || value <= max - db(max);
  return min === null || value >= min + db(min);
}

export function evaluateMetric(
  metric: AlertMetric,
  value: number,
  min: number | null,
  max: number | null,
  state: MetricState,
  nowMs: number,
  cooldownMs: number,
): RuleResult {
  const breach = classify(metric, value, min, max);
  const episode = state.episode;

  // Ongoing episode, value not breaching in the same direction: maybe recovered.
  if (episode && breach?.direction !== episode.direction) {
    const recovered = breach !== null || isRecovered(metric, episode.direction, value, min, max);
    if (!recovered) return { alert: null, next: state }; // inside, but within the deadband
    const ended: MetricState = { ...state, episode: null };
    if (breach === null) {
      return {
        alert:
          episode.announcedSeverity !== null
            ? { type: 'recovered', severity: 'info', limit: null }
            : null,
        next: ended,
      };
    }
    // Jumped straight to the opposite limit: treat as a new episode below.
    return evaluateMetric(metric, value, min, max, ended, nowMs, cooldownMs);
  }

  if (!breach) return { alert: null, next: state };

  // Announced episode: alert again only if severity rises.
  if (episode?.announcedSeverity) {
    if (!higher(breach.severity, episode.announcedSeverity)) return { alert: null, next: state };
    return announce(state, breach, nowMs);
  }

  // New or silent episode: respect the cooldown unless severity rises.
  const cooledDown =
    state.lastBreachAlertAt === null || nowMs - state.lastBreachAlertAt >= cooldownMs;
  if (cooledDown || higher(breach.severity, state.lastBreachAlertSeverity)) {
    return announce(state, breach, nowMs);
  }
  return {
    alert: null,
    next: { ...state, episode: { direction: breach.direction, announcedSeverity: null } },
  };
}

function announce(
  state: MetricState,
  breach: { direction: BreachType; severity: Severity; limit: number },
  nowMs: number,
): RuleResult {
  return {
    alert: { type: breach.direction, severity: breach.severity, limit: breach.limit },
    next: {
      episode: { direction: breach.direction, announcedSeverity: breach.severity },
      lastBreachAlertAt: nowMs,
      lastBreachAlertSeverity: breach.severity,
    },
  };
}
