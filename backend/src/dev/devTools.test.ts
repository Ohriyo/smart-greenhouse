import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DeviceCommandSchema, type DeviceCommand } from '../domain/schemas.js';
import { createDevTools, SIM_FRESH_MS } from './devTools.js';

function build(enabled = true) {
  let now = 1_000_000;
  const queued: { deviceId: string; command: DeviceCommand }[] = [];
  const tools = createDevTools({
    enabled,
    clock: () => now,
    commands: {
      enqueue: (deviceId, command) => {
        queued.push({ deviceId, command });
      },
    },
  });
  return { tools, queued, advance: (ms: number) => (now += ms) };
}

describe('devTools', () => {
  it('knows which devices are the simulator, for 30 seconds after their last reading', () => {
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
    tools.noteTelemetry('gh-01', undefined); // a reading without the marker = real ESP32
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

  it('queues a valid "simulate" command for the device (the real firmware ignores that type)', () => {
    const { tools, queued } = build();
    tools.simulate('gh-01', 'heatwave');
    assert.equal(queued.length, 1);
    const entry = queued[0];
    assert.ok(entry);
    assert.equal(entry.deviceId, 'gh-01');
    const parsed = DeviceCommandSchema.parse(entry.command);
    if (parsed.type !== 'simulate') assert.fail('expected a simulate command');
    assert.equal(parsed.scenario, 'heatwave');
    assert.equal(parsed.issuedAt, new Date(1_000_000).toISOString());
  });

  it('does nothing when disabled', () => {
    const { tools } = build(false);
    tools.noteTelemetry('gh-01', true);
    assert.equal(tools.enabled, false);
    assert.deepEqual(tools.simulatedDevices(), []);
  });
});

describe('simulate commands', () => {
  it('accept exactly the three scenarios', () => {
    const base = { id: 'c1', type: 'simulate', issuedAt: '2026-11-26T00:00:00.000Z' };
    for (const scenario of ['heatwave', 'drysoil', 'normal']) {
      assert.equal(DeviceCommandSchema.safeParse({ ...base, scenario }).success, true, scenario);
    }
    assert.equal(DeviceCommandSchema.safeParse({ ...base, scenario: 'fire' }).success, false);
    assert.equal(DeviceCommandSchema.safeParse(base).success, false);
  });
});
