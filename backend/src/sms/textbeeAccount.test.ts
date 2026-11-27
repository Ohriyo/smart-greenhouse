import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkTextbeeAccount } from './textbeeAccount.js';

const KEY = 'tb_SECRET_key_123456';
const DEVICE = '66b1f2c3a4d5e6f7a8b9c0d1';
const NOW = Date.parse('2026-11-27T06:00:00Z');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const stats = () =>
  json({
    data: {
      totalSentSMSCount: 3,
      totalReceivedSMSCount: 0,
      totalDeviceCount: 1,
      totalApiKeyCount: 1,
    },
  });

/** A healthy phone, shaped like the documented DeviceDTO (subset). */
function phone(overrides: Record<string, unknown> = {}) {
  return {
    _id: DEVICE,
    enabled: true,
    isDefault: true,
    name: 'Greenhouse phone',
    brand: 'samsung',
    model: 'SM-A146',
    lastHeartbeat: new Date(NOW - 10 * 60_000).toISOString(),
    receiveSMSEnabled: false,
    batteryInfo: { percentage: 80, isCharging: true, lastUpdated: 'x' },
    powerInfo: { isIgnoringBatteryOptimizations: true, isPowerSaveMode: false, lastUpdated: 'x' },
    simInfo: {
      lastUpdated: 'x',
      sims: [
        { subscriptionId: 1, simSlotIndex: 0, carrierName: 'Globe', serviceState: 'IN_SERVICE' },
      ],
    },
    ...overrides,
  };
}

/** Answers by URL path; records the headers. */
function fakeFetch(routes: Record<string, () => Response>) {
  const headers: Headers[] = [];
  const fetchFn = ((input: string | URL | Request, init?: RequestInit) => {
    headers.push(new Headers(init?.headers));
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const route = Object.keys(routes).find((path) => url.endsWith(path));
    if (!route) return Promise.reject(new TypeError('fetch failed'));
    return Promise.resolve(routes[route]?.() ?? new Response('', { status: 500 }));
  }) as typeof fetch;
  return { fetchFn, headers };
}

const check = (fetchFn: typeof fetch, extra: { deviceId?: string; simSlot?: number } = {}) =>
  checkTextbeeAccount({ apiKey: KEY, deviceId: DEVICE, ...extra, fetchFn, now: NOW });

const levels = (r: { lines: { level: string; text: string }[] }, level: string) =>
  r.lines.filter((l) => l.level === level).map((l) => l.text);

describe('checkTextbeeAccount', () => {
  it('a healthy setup: key accepted, phone enabled and awake, SIM in service', async () => {
    const { fetchFn, headers } = fakeFetch({
      '/gateway/stats': stats,
      '/gateway/devices': () => json({ data: [phone()] }),
    });
    const result = await check(fetchFn);
    assert.equal(result.ok, true, JSON.stringify(result.lines));
    assert.deepEqual(levels(result, 'warn'), []);
    assert.equal(headers[0]?.get('x-api-key'), KEY);
    assert.ok(result.lines.some((l) => l.text.includes('Greenhouse phone')));
    assert.ok(result.lines.some((l) => l.text.includes('Globe')));
  });

  it('a rejected key stops early, with the key redacted', async () => {
    const { fetchFn } = fakeFetch({
      '/gateway/stats': () => json({ error: `Unauthorized ${KEY}`, code: 'AUTH_INVALID' }, 401),
    });
    const result = await check(fetchFn);
    assert.equal(result.ok, false);
    assert.equal(result.lines.length, 1);
    assert.match(result.lines[0]?.text ?? '', /HTTP 401.*TEXTBEE_API_KEY/);
    assert.ok(!result.lines[0]?.text.includes(KEY));
  });

  it('no internet is explained', async () => {
    const { fetchFn } = fakeFetch({});
    const result = await check(fetchFn);
    assert.equal(result.ok, false);
    assert.match(result.lines[0]?.text ?? '', /Could not reach textbee/);
  });

  it('no linked phone is an error', async () => {
    const { fetchFn } = fakeFetch({
      '/gateway/stats': stats,
      '/gateway/devices': () => json({ data: [] }),
    });
    const result = await check(fetchFn);
    assert.equal(result.ok, false);
    assert.match(levels(result, 'error')[0] ?? '', /No phone is linked/);
  });

  it('a TEXTBEE_DEVICE_ID that is not on the account is an error listing the real ids', async () => {
    const { fetchFn } = fakeFetch({
      '/gateway/stats': stats,
      '/gateway/devices': () => json({ data: [phone({ _id: 'another1' })] }),
    });
    const result = await check(fetchFn);
    assert.equal(result.ok, false);
    assert.match(levels(result, 'error')[0] ?? '', /another1/);
  });

  it('no TEXTBEE_DEVICE_ID: a warning naming the phone textbee will probably use', async () => {
    const { fetchFn } = fakeFetch({
      '/gateway/stats': stats,
      '/gateway/devices': () => json({ data: [phone()] }),
    });
    const result = await checkTextbeeAccount({ apiKey: KEY, fetchFn, now: NOW });
    assert.equal(result.ok, true);
    assert.match(
      levels(result, 'warn')[0] ?? '',
      new RegExp(`TEXTBEE_DEVICE_ID is empty.*${DEVICE}`),
    );
  });

  it('a disabled phone is an error', async () => {
    const { fetchFn } = fakeFetch({
      '/gateway/stats': stats,
      '/gateway/devices': () => json({ data: [phone({ enabled: false })] }),
    });
    const result = await check(fetchFn);
    assert.equal(result.ok, false);
    assert.match(levels(result, 'error')[0] ?? '', /disabled/);
  });

  it('warns about an asleep phone, battery optimization, battery saver, low battery, no signal, receiving', async () => {
    const { fetchFn } = fakeFetch({
      '/gateway/stats': stats,
      '/gateway/devices': () =>
        json({
          data: [
            phone({
              lastHeartbeat: new Date(NOW - 3 * 3_600_000).toISOString(),
              powerInfo: { isIgnoringBatteryOptimizations: false, isPowerSaveMode: true },
              batteryInfo: { percentage: 12, isCharging: false },
              simInfo: { sims: [{ simSlotIndex: 0, serviceState: 'OUT_OF_SERVICE' }] },
              receiveSMSEnabled: true,
            }),
          ],
        }),
    });
    const result = await check(fetchFn);
    assert.equal(result.ok, true); // warnings only
    const warns = levels(result, 'warn').join('\n');
    assert.match(warns, /3 h ago/);
    assert.match(warns, /Unrestricted/);
    assert.match(warns, /Battery saver/);
    assert.match(warns, /12%/);
    assert.match(warns, /OUT_OF_SERVICE/);
    assert.match(warns, /Receiving SMS is on/);
  });

  it('a TEXTBEE_SIM_SLOT without a SIM card is an error', async () => {
    const { fetchFn } = fakeFetch({
      '/gateway/stats': stats,
      '/gateway/devices': () => json({ data: [phone()] }),
    });
    const result = await check(fetchFn, { simSlot: 1 });
    assert.equal(result.ok, false);
    assert.match(levels(result, 'error')[0] ?? '', /TEXTBEE_SIM_SLOT=1 \(SIM 2\) has no SIM card/);
  });
});
