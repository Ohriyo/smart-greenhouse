import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EMPTY_STATE, evaluateMetric, type MetricState } from './thresholdRule.js';

const MIN = 60_000;
const COOLDOWN = 15 * MIN;

/** Feeds values (one per minute) and returns the alerts as "type:severity". */
function run(values: number[], min: number | null, max: number | null, start = EMPTY_STATE) {
  let state: MetricState = start;
  const alerts: string[] = [];
  values.forEach((v, i) => {
    const r = evaluateMetric('airTemp', v, min, max, state, i * MIN, COOLDOWN);
    state = r.next;
    if (r.alert) alerts.push(`${r.alert.type}:${r.alert.severity}`);
  });
  return { alerts, state };
}

describe('threshold rule (airTemp, max 35, deadband 0.5, critical +3)', () => {
  it('alerts once while the value stays high', () => {
    assert.deepEqual(run([30, 36, 36.5, 36, 37], 15, 35).alerts, ['above_max:warning']);
  });

  it('escalates when severity rises, not when it falls back', () => {
    assert.deepEqual(run([36, 38.5, 36, 39], 15, 35).alerts, [
      'above_max:warning',
      'above_max:critical',
    ]);
  });

  it('recovers only past the deadband', () => {
    assert.deepEqual(run([36, 34.8, 34.4], 15, 35).alerts, ['above_max:warning', 'recovered:info']);
  });

  it('suppresses a re-breach within the cooldown, and its recovery', () => {
    // breach (t0), recover (t1), breach again (t2), recover (t3): only the first pair alerts
    assert.deepEqual(run([36, 30, 36, 30], 15, 35).alerts, ['above_max:warning', 'recovered:info']);
  });

  it('announces a silent episode once the cooldown has passed', () => {
    const values = [36, 30, ...Array<number>(16).fill(36)];
    assert.deepEqual(run(values, 15, 35).alerts, [
      'above_max:warning',
      'recovered:info',
      'above_max:warning',
    ]);
  });

  it('a re-breach within the cooldown alerts if more severe', () => {
    assert.deepEqual(run([36, 30, 39], 15, 35).alerts, [
      'above_max:warning',
      'recovered:info',
      'above_max:critical',
    ]);
  });

  it('handles the low side and removed limits', () => {
    assert.deepEqual(run([14, 11.5], 15, 35).alerts, ['below_min:warning', 'below_min:critical']);
    const { state } = run([40], 15, 35);
    assert.deepEqual(run([40], 15, null, state).alerts, ['recovered:info']);
  });
});
