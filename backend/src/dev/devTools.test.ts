import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createDevTools, SIM_FRESH_MS } from './devTools.js';
import { SimScenarioSchema } from './scenarios.js';

function build(enabled = true) {
  let now = 1_000_000;
  const published: { topic: string; payload: string }[] = [];
  const tools = createDevTools({
    enabled,
    clock: () => now,
    publish: (topic, payload) => {
      published.push({ topic, payload });
      return Promise.resolve();
    },
  });
  return { tools, published, advance: (ms: number) => (now += ms) };
}

describe('devTools', () => {
  it('knows which devices are the simulator, for 30 seconds after their last telemetry', () => {
    const { tools, advance } = build();
    tools.noteTelemetry('gh-01', true);
    assert.deepEqual(tools.simulatedDevices(), ['gh-01']);
    advance(SIM_FRESH_MS);
    assert.deepEqual(tools.simulatedDevices(), ['gh-01'], 'still fresh at exactly 30 s');
    advance(1);
    assert.deepEqual(tools.simulatedDevices(), [], 'stale after that');
  });

  it('real hardware taking over the same id removes the simulator mark', () => {
    const { tools } = build();
    tools.noteTelemetry('gh-01', true);
    tools.noteTelemetry('gh-01', undefined); // telemetry without the marker = real ESP32
    assert.deepEqual(tools.simulatedDevices(), []);
    tools.noteTelemetry('gh-01', false);
    assert.deepEqual(tools.simulatedDevices(), []);
  });

  it('lists several simulators in order', () => {
    const { tools } = build();
    tools.noteTelemetry('gh-b', true);
    tools.noteTelemetry('gh-a', true);
    assert.deepEqual(tools.simulatedDevices(), ['gh-a', 'gh-b']);
  });

  it('publishes a scenario on the dev-only sim topic (never on command/telemetry)', async () => {
    const { tools, published } = build();
    await tools.simulate('gh-01', 'heatwave');
    assert.deepEqual(published, [
      { topic: 'greenhouse/gh-01/sim', payload: '{"scenario":"heatwave"}' },
    ]);
  });

  it('does nothing when disabled', () => {
    const { tools } = build(false);
    tools.noteTelemetry('gh-01', true);
    assert.equal(tools.enabled, false);
    assert.deepEqual(tools.simulatedDevices(), []);
  });
});

describe('scenario messages', () => {
  it('accepts exactly the three scenarios', () => {
    for (const scenario of ['heatwave', 'drysoil', 'normal']) {
      assert.equal(SimScenarioSchema.safeParse({ scenario }).success, true, scenario);
    }
    assert.equal(SimScenarioSchema.safeParse({ scenario: 'fire' }).success, false);
    assert.equal(SimScenarioSchema.safeParse({}).success, false);
  });
});
