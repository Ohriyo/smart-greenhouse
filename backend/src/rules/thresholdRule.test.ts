import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EMPTY_STATE, evaluateMetric, transitions, type MetricState } from './thresholdRule.js';

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

/** Feeds values (one per minute) and returns the transitions as "kind:direction". */
function changes(values: number[], min: number | null, max: number | null) {
  let state: MetricState = EMPTY_STATE;
  const out: string[] = [];
  values.forEach((v, i) => {
    const r = evaluateMetric('airTemp', v, min, max, state, i * MIN, COOLDOWN);
    for (const t of transitions(state, r.next)) out.push(`${t.kind}:${t.direction}`);
    state = r.next;
  });
  return out;
}

describe('transitions (what the SMS alerts react to)', () => {
  it('nothing while the value stays inside the limits', () => {
    assert.deepEqual(changes([20, 25, 34.9, 15, 30], 15, 35), []);
  });

  it('a crossing, then a recovery past the deadband', () => {
    assert.deepEqual(changes([30, 36, 36.5, 34.8, 34.4], 15, 35), [
      'crossed:above_max',
      'recovered:above_max',
    ]);
  });

  it('severity changes inside an episode are not transitions', () => {
    assert.deepEqual(changes([36, 39, 36, 40], 15, 35), ['crossed:above_max']);
  });

  it('a re-crossing within the in-app cooldown is still a crossing (the SMS layer decides)', () => {
    assert.deepEqual(changes([36, 30, 36], 15, 35), [
      'crossed:above_max',
      'recovered:above_max',
      'crossed:above_max',
    ]);
  });

  it('a silent episode that gets announced after the cooldown', () => {
    const values = [36, 30, ...Array<number>(16).fill(36)];
    assert.deepEqual(changes(values, 15, 35), [
      'crossed:above_max',
      'recovered:above_max',
      'crossed:above_max',
      'announced:above_max',
    ]);
  });

  it('a jump straight to the other limit is only a crossing (no "back to normal")', () => {
    assert.deepEqual(changes([36, 10], 15, 35), ['crossed:above_max', 'crossed:below_min']);
  });
});
