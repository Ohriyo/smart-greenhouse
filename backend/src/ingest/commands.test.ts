import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeviceCommand } from '../domain/schemas.js';
import {
  COMMAND_TTL_MS,
  createCommandRouter,
  createPendingCommands,
  type CommandPublisher,
} from './commands.js';

const cal = (id: string, point: 'dry' | 'wet' = 'dry'): DeviceCommand => ({
  id,
  type: 'calibrateSoil',
  point,
  issuedAt: new Date().toISOString(),
});

function fakePublisher(opts: { connected?: boolean; fail?: boolean } = {}) {
  const published: [string, string][] = [];
  const publisher: CommandPublisher = {
    isConnected: () => opts.connected ?? true,
    publish: (deviceId, command) => {
      if (opts.fail) return Promise.reject(new Error('broker did not acknowledge'));
      published.push([deviceId, command.id]);
      return Promise.resolve();
    },
  };
  return { publisher, published };
}

describe('pending commands', () => {
  it('delivers once, newest of a type wins, expires after the TTL', () => {
    let now = 0;
    const pending = createPendingCommands(() => now);
    pending.enqueue('gh-01', cal('a'));
    pending.enqueue('gh-01', cal('b', 'wet'));
    assert.deepEqual(
      pending.take('gh-01').map((c) => c.id),
      ['b'],
    );
    assert.deepEqual(pending.take('gh-01'), []);
    pending.enqueue('gh-01', cal('c'));
    now += COMMAND_TTL_MS + 1;
    assert.deepEqual(pending.take('gh-01'), []);
  });
});

describe('command router', () => {
  it('publishes at once when the latest reading came over MQTT', async () => {
    const { publisher, published } = fakePublisher();
    const router = createCommandRouter(createPendingCommands(), publisher);
    router.takeFor('gh-01', 'mqtt');
    assert.equal(await router.deliver('gh-01', cal('a')), 'mqtt');
    assert.deepEqual(published, [['gh-01', 'a']]);
    assert.deepEqual(router.takeFor('gh-01', 'mqtt'), []); // not also queued
  });

  it('queues for the next reading when the device is on HTTPS or unknown', async () => {
    const { publisher, published } = fakePublisher();
    const router = createCommandRouter(createPendingCommands(), publisher);
    assert.equal(await router.deliver('gh-01', cal('a')), 'queued'); // never heard
    assert.deepEqual(
      router.takeFor('gh-01', 'https').map((c) => c.id),
      ['a'],
    );
    assert.equal(await router.deliver('gh-01', cal('b', 'wet')), 'queued'); // on HTTPS
    assert.deepEqual(published, []);
    assert.deepEqual(
      router.takeFor('gh-01', 'https').map((c) => c.id),
      ['b'],
    );
  });

  it('queues when the broker is down, the publish fails, or after a Last Will', async () => {
    const down = createCommandRouter(
      createPendingCommands(),
      fakePublisher({ connected: false }).publisher,
    );
    down.takeFor('gh-01', 'mqtt');
    assert.equal(await down.deliver('gh-01', cal('a')), 'queued');

    const failing = createCommandRouter(
      createPendingCommands(),
      fakePublisher({ fail: true }).publisher,
    );
    failing.takeFor('gh-01', 'mqtt');
    assert.equal(await failing.deliver('gh-01', cal('b')), 'queued');
    assert.deepEqual(
      failing.takeFor('gh-01', 'https').map((c) => c.id),
      ['b'],
    );

    const { publisher } = fakePublisher();
    const lost = createCommandRouter(createPendingCommands(), publisher);
    lost.takeFor('gh-01', 'mqtt');
    lost.linkLost('gh-01');
    assert.equal(lost.transportOf('gh-01'), undefined);
    assert.equal(await lost.deliver('gh-01', cal('c')), 'queued');
  });

  it('without MQTT (MQTT_URL empty) everything is queued', async () => {
    const router = createCommandRouter(createPendingCommands(), null);
    router.takeFor('gh-01', 'mqtt');
    assert.equal(await router.deliver('gh-01', cal('a')), 'queued');
  });
});
