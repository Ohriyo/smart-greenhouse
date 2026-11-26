import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asciiOnly,
  formatSmsValue,
  manilaClock,
  offlineMessage,
  onlineMessage,
  recoveryMessage,
  SMS_MAX_CHARS,
  smsName,
  testMessage,
  thresholdMessage,
} from './messages.js';

const T = Date.UTC(2026, 10, 26, 6, 32); // 14:32 in Manila

describe('threshold SMS (spec: "[Greenhouse] Soil moisture LOW: 18% (min 30%) at 14:32")', () => {
  it('matches the spec example exactly', () => {
    assert.equal(
      thresholdMessage({ metric: 'soilMoisture', condition: 'LOW', value: 18, limit: 30, at: T }),
      '[Greenhouse] Soil moisture LOW: 18% (min 30%) at 14:32',
    );
  });

  it('air temperature, humidity and light', () => {
    assert.equal(
      thresholdMessage({ metric: 'airTemp', condition: 'HIGH', value: 38.44, limit: 35, at: T }),
      '[Greenhouse] Air temp HIGH: 38.4C (max 35C) at 14:32',
    );
    assert.equal(
      thresholdMessage({ metric: 'humidity', condition: 'HIGH', value: 97.25, limit: 85, at: T }),
      '[Greenhouse] Humidity HIGH: 97.3% (max 85%) at 14:32',
    );
    assert.equal(
      thresholdMessage({ metric: 'lux', condition: 'LOW', value: 120.4, limit: 500, at: T }),
      '[Greenhouse] Light LOW: 120 lux (min 500 lux) at 14:32',
    );
  });

  it('works without a known limit', () => {
    assert.equal(
      thresholdMessage({ metric: 'airTemp', condition: 'LOW', value: 9, limit: null, at: T }),
      '[Greenhouse] Air temp LOW: 9C at 14:32',
    );
  });
});

describe('other SMS', () => {
  it('back to normal, offline, online and test', () => {
    assert.equal(
      recoveryMessage({ metric: 'soilMoisture', value: 35, at: T }),
      '[Greenhouse] Soil moisture back to normal: 35% at 14:32',
    );
    assert.equal(
      offlineMessage({ name: 'Greenhouse 01', minutes: 12.4, lastSeen: T }),
      '[Greenhouse] Greenhouse 01 OFFLINE: no data for 12 min (last seen 14:32)',
    );
    assert.equal(
      offlineMessage({ name: 'gh-01', minutes: 65, lastSeen: T }),
      '[Greenhouse] gh-01 OFFLINE: no data for 1 h 5 min (last seen 14:32)',
    );
    assert.equal(onlineMessage({ name: 'gh-01', at: T }), '[Greenhouse] gh-01 back ONLINE at 14:32');
    assert.equal(testMessage(T), '[Greenhouse] Test message: SMS alerts are working (14:32)');
  });
});

describe('one plain SMS every time', () => {
  const samples = [
    thresholdMessage({ metric: 'lux', condition: 'HIGH', value: 199_999.9, limit: 150_000, at: T }),
    recoveryMessage({ metric: 'humidity', value: 61.23, at: T }),
    offlineMessage({ name: 'Ä'.repeat(40), minutes: 60 * 23 + 59, lastSeen: T }),
    onlineMessage({ name: 'Serre Süd — Nord ☀', at: T }),
    testMessage(T),
  ];

  it('ASCII only, at most 160 characters, never starting with "TEST"', () => {
    for (const s of samples) {
      assert.match(s, /^[\x20-\x7e]+$/, s);
      assert.ok(s.length <= SMS_MAX_CHARS, `${s.length}: ${s}`);
      assert.doesNotMatch(s, /^\s*test/i, s);
    }
  });

  it('manilaClock is UTC+8', () => {
    assert.equal(manilaClock(Date.UTC(2026, 10, 26, 16, 5)), '00:05');
  });

  it('strips accents and replaces other characters', () => {
    assert.equal(asciiOnly('Serre Süd — Nord ☀'), 'Serre Sud ? Nord ?');
    assert.equal(asciiOnly('line\nbreak\ttab'), 'line break tab');
  });

  it('shortens long names to 20 characters', () => {
    assert.equal(smsName('A very long greenhouse name'), 'A very long greenho.');
  });

  it('formats values without trailing zeros and without the degree sign', () => {
    assert.equal(formatSmsValue('airTemp', 35), '35C');
    assert.equal(formatSmsValue('airTemp', 35.04), '35C');
    assert.equal(formatSmsValue('humidity', 40.55), '40.5%');
    assert.equal(formatSmsValue('lux', 90_000.4), '90000 lux');
  });
});
