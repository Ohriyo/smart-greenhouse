import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  airTempBackMessage,
  asciiOnly,
  backInRangeMessage,
  backOnlineMessage,
  criticalMessage,
  formatSmsValue,
  manilaClock,
  offlineMessage,
  SMS_MAX_CHARS,
  smsName,
  stabilizedMessage,
  testMessage,
} from './messages.js';

/** Every SMS must be plain ASCII and fit in one message. */
function assertOneSms(text: string): void {
  assert.ok(text.length <= SMS_MAX_CHARS, `too long (${text.length}): ${text}`);
  assert.match(text, /^[\x20-\x7e]+$/, `not plain ASCII: ${text}`);
}

describe('criticalMessage', () => {
  it('air temp too hot, fan running in auto', () => {
    const m = criticalMessage({
      metric: 'airTemp',
      type: 'above_max',
      value: 38.4,
      limit: 35,
      name: 'Greenhouse 01',
      fan: { on: true, mode: 'auto' },
    });
    assert.equal(m, 'ETanim CRITICAL: Air temp 38.4 C (max 35). Fan ON (auto). Greenhouse 01');
    assertOneSms(m);
  });

  it('air temp too hot, fan forced off: tells the owner to act', () => {
    const m = criticalMessage({
      metric: 'airTemp',
      type: 'above_max',
      value: 39,
      limit: 35,
      name: 'GH',
      fan: { on: false, mode: 'off' },
    });
    assert.match(m, /Fan is OFF \(manual\)\. Turn it on in the app!/);
    assertOneSms(m);
  });

  it('air temp too hot, fan off in auto: flagged as a possible fault', () => {
    const m = criticalMessage({
      metric: 'airTemp',
      type: 'above_max',
      value: 39,
      limit: 35,
      name: 'GH',
      fan: { on: false, mode: 'auto' },
    });
    assert.match(m, /Fan is OFF but should be running\. Check it!/);
  });

  it('unknown fan state is said, not guessed', () => {
    const m = criticalMessage({
      metric: 'airTemp',
      type: 'above_max',
      value: 39,
      limit: 35,
      name: 'GH',
      fan: null,
    });
    assert.match(m, /Fan state unknown\./);
  });

  it('air temp too cold has no fan sentence', () => {
    const m = criticalMessage({
      metric: 'airTemp',
      type: 'below_min',
      value: 4.2,
      limit: 10,
      name: 'GH',
      fan: { on: false, mode: 'auto' },
    });
    assert.equal(m, 'ETanim CRITICAL: Air temp 4.2 C (min 10). Too cold. GH');
  });

  it('other sensors never mention the fan', () => {
    const humidity = criticalMessage({
      metric: 'humidity',
      type: 'above_max',
      value: 97.3,
      limit: 85,
      name: 'GH',
      fan: { on: true, mode: 'auto' },
    });
    const soil = criticalMessage({
      metric: 'soilMoisture',
      type: 'below_min',
      value: 12,
      limit: 30,
      name: 'GH',
      fan: null,
    });
    const light = criticalMessage({
      metric: 'lux',
      type: 'above_max',
      value: 91234,
      limit: 60000,
      name: 'GH',
      fan: null,
    });
    assert.equal(humidity, 'ETanim CRITICAL: Humidity 97.3 % (max 85). GH');
    assert.equal(soil, 'ETanim CRITICAL: Soil moisture 12 % (min 30). GH');
    assert.equal(light, 'ETanim CRITICAL: Light 91234 lux (max 60000). GH');
  });

  it('works without a known limit (older alerts)', () => {
    const m = criticalMessage({
      metric: 'humidity',
      type: 'above_max',
      value: 97,
      limit: null,
      name: 'GH',
      fan: null,
    });
    assert.equal(m, 'ETanim CRITICAL: Humidity 97 %. GH');
  });
});

describe('closing messages', () => {
  it('stabilized: temperature settled and the fan switched off', () => {
    const m = stabilizedMessage({ value: 28, name: 'Greenhouse 01' });
    assert.equal(m, 'ETanim OK: Air temp back to 28 C. Fan turned OFF. Greenhouse 01');
    assertOneSms(m);
  });

  it('back in range but the fan still runs', () => {
    assert.match(
      airTempBackMessage({ value: 33.9, name: 'GH', fan: { on: true, mode: 'on' } }),
      /Air temp back to 33\.9 C\. Fan still ON \(manual\)\./,
    );
    assert.match(
      airTempBackMessage({ value: 33.9, name: 'GH', fan: { on: true, mode: 'auto' } }),
      /Fan still ON \(auto\)\./,
    );
  });

  it('humidity, soil and light back in range', () => {
    assert.equal(
      backInRangeMessage({ metric: 'humidity', value: 62, name: 'GH' }),
      'ETanim OK: Humidity back in range: 62 %. GH',
    );
    assert.equal(
      backInRangeMessage({ metric: 'lux', value: null, name: 'GH' }),
      'ETanim OK: Light back in range. GH',
    );
  });

  it('back online', () => {
    assert.equal(
      backOnlineMessage({ name: 'Greenhouse 01' }),
      'ETanim OK: Greenhouse 01 is back online.',
    );
  });
});

describe('offlineMessage', () => {
  it('says how long and when it was last seen (Manila time)', () => {
    const lastSeen = Date.UTC(2026, 10, 9, 6, 5); // 14:05 in Manila
    const m = offlineMessage({ name: 'Greenhouse 01', minutes: 12.4, lastSeen });
    assert.equal(
      m,
      'ETanim ALERT: Greenhouse 01 offline for 12 min (last seen 14:05). The fan keeps running on its own.',
    );
    assertOneSms(m);
  });

  it('writes long durations in hours', () => {
    assert.match(offlineMessage({ name: 'GH', minutes: 65, lastSeen: 0 }), /offline for 1 h 5 min/);
    assert.match(offlineMessage({ name: 'GH', minutes: 120, lastSeen: 0 }), /offline for 2 h /);
  });
});

describe('plain-ASCII guarantees', () => {
  it('manilaClock is UTC+8', () => {
    assert.equal(manilaClock(Date.UTC(2026, 10, 9, 16, 5)), '00:05');
  });

  it('strips accents and replaces other characters', () => {
    assert.equal(asciiOnly('Serre Süd'), 'Serre Sud');
    assert.equal(asciiOnly('Café №1'), 'Cafe No1'); // compatibility forms become plain letters
    assert.equal(asciiOnly('a☃b'), 'a?b'); // no ASCII equivalent: a question mark
    assert.equal(asciiOnly('a\nb'), 'a b');
  });

  it('shortens long names to 20 characters', () => {
    assert.equal(smsName('x'.repeat(40)).length, 20);
  });

  it('a 40-character non-ASCII name still gives one plain SMS', () => {
    const m = criticalMessage({
      metric: 'airTemp',
      type: 'above_max',
      value: 38.46,
      limit: 35,
      name: 'Ünïcödé greenhouse ☃☃☃ number one hundred',
      fan: { on: false, mode: 'off' },
    });
    assertOneSms(m);
  });

  it('formats values without trailing zeros and without the degree sign', () => {
    assert.equal(formatSmsValue('airTemp', 30), '30 C');
    assert.equal(formatSmsValue('airTemp', 30.04), '30 C');
    assert.equal(formatSmsValue('lux', 27800.4), '27800 lux');
    assertOneSms(testMessage());
  });
});
