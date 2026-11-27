import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeviceCommand } from '../domain/schemas.js';
import { brokerLabel, errorText, explainBrokerError, reconnectDelay } from './client.js';
import { createCommandPublisher, type PublishClient } from './commands.js';
import { parseTopic, SUBSCRIPTIONS, topics } from './topics.js';

describe('reconnectDelay', () => {
  it('doubles from 1 s and caps at 30 s, with jitter between 50 % and 100 %', () => {
    const high = () => 1;
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5, 6, 10].map((a) => reconnectDelay(a, high)),
      [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000],
    );
    assert.equal(
      reconnectDelay(3, () => 0),
      4000,
    );
    assert.equal(
      reconnectDelay(10, () => 0),
      15000,
    );
  });
});

describe('broker helpers', () => {
  it('brokerLabel keeps scheme, host and port only (never a login or path)', () => {
    assert.equal(
      brokerLabel('mqtts://abc.ala.asia-southeast1.emqxsl.com:8883'),
      'mqtts://abc.ala.asia-southeast1.emqxsl.com:8883',
    );
    assert.equal(brokerLabel('wss://u:secret@host.example:8084/mqtt'), 'wss://host.example:8084');
    assert.equal(brokerLabel('not a url'), 'the broker');
  });

  it('explainBrokerError points at the setting to fix', () => {
    assert.match(
      explainBrokerError('Connection refused: Bad username or password'),
      /MQTT_USERNAME/,
    );
    assert.match(explainBrokerError('Connection refused: Not authorized'), /MQTT_PASSWORD/);
    assert.match(explainBrokerError('getaddrinfo ENOTFOUND x.emqxsl.com'), /host in MQTT_URL/);
    assert.match(explainBrokerError('connect ECONNREFUSED 1.2.3.4:8883'), /port/);
    assert.equal(explainBrokerError('something else'), 'something else');
  });
});

describe('topics', () => {
  it('builds and parses greenhouse/{deviceId}/{kind}', () => {
    assert.equal(topics.telemetry('gh-01'), 'greenhouse/gh-01/telemetry');
    assert.equal(topics.status('gh-01'), 'greenhouse/gh-01/status');
    assert.equal(topics.command('gh-01'), 'greenhouse/gh-01/command');
    assert.deepEqual(SUBSCRIPTIONS, ['greenhouse/+/telemetry', 'greenhouse/+/status']);
    assert.deepEqual(parseTopic('greenhouse/gh-01/telemetry'), {
      deviceId: 'gh-01',
      kind: 'telemetry',
    });
    assert.deepEqual(parseTopic('greenhouse/gh-01/status'), { deviceId: 'gh-01', kind: 'status' });
  });

  it('ignores commands (our own), other trees and invalid device ids', () => {
    assert.equal(parseTopic('greenhouse/gh-01/command'), null);
    assert.equal(parseTopic('other/gh-01/telemetry'), null);
    assert.equal(parseTopic('greenhouse/bad id/telemetry'), null);
    assert.equal(parseTopic('greenhouse/gh-01/telemetry/extra'), null);
  });
});

describe('command publisher', () => {
  const command: DeviceCommand = {
    id: 'c1',
    type: 'calibrateSoil',
    point: 'dry',
    issuedAt: '2026-11-27T00:00:00.000Z',
  };

  it('publishes JSON with QoS 1, not retained, on the device command topic', async () => {
    const sent: { topic: string; message: string; opts: unknown }[] = [];
    const client: PublishClient = {
      connected: true,
      publishAsync: (topic, message, opts) => {
        sent.push({ topic, message, opts });
        return Promise.resolve(undefined);
      },
    };
    await createCommandPublisher(client).publish('gh-01', command);
    assert.deepEqual(sent, [
      {
        topic: 'greenhouse/gh-01/command',
        message: JSON.stringify(command),
        opts: { qos: 1, retain: false },
      },
    ]);
  });

  it('rejects at once when the broker is not connected (no hidden queue)', async () => {
    const client: PublishClient = {
      connected: false,
      publishAsync: () => Promise.reject(new Error('must not be called')),
    };
    await assert.rejects(createCommandPublisher(client).publish('gh-01', command), /not connected/);
  });
});

describe('errorText', () => {
  it('uses the inner errors of an AggregateError (refused localhost has no message)', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8883'), {
      code: 'ECONNREFUSED',
    });
    assert.equal(errorText(new AggregateError([refused, refused], '')), refused.message);
    assert.equal(errorText(Object.assign(new Error(''), { code: 'ECONNRESET' })), 'ECONNRESET');
    assert.equal(errorText(new Error('Not authorized')), 'Not authorized');
  });
});
