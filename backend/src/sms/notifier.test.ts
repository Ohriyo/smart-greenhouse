import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createSmsNotifier,
  OFFLINE_MAX_AGE_MS,
  RETRY_FAILED_MS,
  TEST_LIMIT_PER_HOUR,
  type SmsCandidate,
} from './notifier.js';
import type { SmsProvider, SmsSendResult } from './provider.js';
import {
  DELIVERED,
  type DeviceInfo,
  type SmsAlertRow,
  type SmsQuery,
  type SmsStore,
} from './store.js';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 26, 6, 0); // 14:00 in Manila
const NUMBERS = ['09171234567', '09187654321'];

/** In-memory SmsStore with the same semantics as the Prisma one. */
function createFakeStore() {
  const rows: SmsAlertRow[] = [];
  const devices = new Map<string, DeviceInfo>();
  const alertIds = new Map<string, number>();
  const matches = (r: SmsAlertRow, q: SmsQuery) =>
    r.deviceId === q.deviceId && r.sensor === q.sensor && q.conditions.includes(r.condition);
  // Rows are appended in time order (the fake clock only moves forward).
  const newest = (list: SmsAlertRow[]) => list.at(-1) ?? null;

  const store: SmsStore = {
    record: (row) => {
      const saved = { ...row, id: rows.length + 1 };
      rows.push(saved);
      return Promise.resolve(saved);
    },
    lastDelivered: (q) =>
      Promise.resolve(newest(rows.filter((r) => matches(r, q) && DELIVERED.includes(r.status)))),
    lastAttempt: (q) => Promise.resolve(newest(rows.filter((r) => matches(r, q)))),
    countSentSince: (since) =>
      Promise.resolve(
        rows.filter((r) => r.status === 'sent' && r.kind !== 'test' && r.createdAt >= since).length,
      ),
    countTestsSince: (since) =>
      Promise.resolve(rows.filter((r) => r.kind === 'test' && r.createdAt >= since).length),
    recent: (limit) => Promise.resolve([...rows].reverse().slice(0, limit)),
    listDevices: () => Promise.resolve([...devices.values()]),
    latestAlertId: (deviceId, type) => Promise.resolve(alertIds.get(`${deviceId}:${type}`) ?? null),
  };
  return { store, rows, devices, alertIds };
}

/** Records every send; answers with `reply` (default: accepted). */
function fakeProvider(reply: () => Promise<SmsSendResult> | SmsSendResult = () => ok) {
  const calls: { recipients: string[]; text: string }[] = [];
  const provider: SmsProvider = {
    name: 'semaphore',
    send: async (recipients, text) => {
      calls.push({ recipients: [...recipients], text });
      return reply();
    },
  };
  return { provider, calls };
}
const ok: SmsSendResult = { ok: true, providerResponse: '[{"status":"Queued"}]', attempts: 1 };

function build(
  opts: {
    dryRun?: boolean;
    recipients?: string[];
    dailyCap?: number;
    reply?: () => Promise<SmsSendResult> | SmsSendResult;
  } = {},
) {
  let now = T0;
  const fake = createFakeStore();
  const { provider, calls } = fakeProvider(opts.reply);
  const sms = createSmsNotifier({
    store: fake.store,
    provider,
    providerName: 'semaphore',
    dryRun: opts.dryRun ?? false,
    recipients: opts.recipients ?? NUMBERS,
    cooldownMs: 30 * MIN,
    dailyCap: opts.dailyCap ?? 10,
    offlineAfterMs: 10 * MIN,
    clock: () => now,
  });
  return {
    sms,
    calls,
    rows: fake.rows,
    devices: fake.devices,
    alertIds: fake.alertIds,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const high = (over: Partial<SmsCandidate> = {}): SmsCandidate => ({
  deviceId: 'gh-01',
  metric: 'airTemp',
  condition: 'HIGH',
  value: 38.4,
  limit: 35,
  alertId: 7,
  ...over,
});
const normal = (over: Partial<SmsCandidate> = {}): SmsCandidate => ({
  ...high(),
  condition: 'NORMAL',
  value: 33,
  limit: null,
  alertId: 8,
  ...over,
});

describe('SMS on threshold crossings', () => {
  it('a crossing sends ONE SMS to every number, with the spec format, and records it', async () => {
    const t = build();
    await t.sms.onCandidate(high());

    assert.equal(t.calls.length, 1);
    assert.deepEqual(t.calls[0], {
      recipients: NUMBERS,
      text: '[Greenhouse] Air temp HIGH: 38.4C (max 35C) at 14:00',
    });
    const row = t.rows[0];
    assert.ok(row);
    assert.equal(row.status, 'sent');
    assert.equal(row.kind, 'threshold');
    assert.equal(row.sensor, 'airTemp');
    assert.equal(row.condition, 'HIGH');
    assert.equal(row.value, 38.4);
    assert.equal(row.threshold, 35);
    assert.equal(row.alertId, 7);
    assert.equal(row.recipients, '091••••4567, 091••••4321', 'numbers stored masked');
    assert.equal(row.providerResponse, ok.providerResponse);
  });

  it('a second crossing within the cooldown is recorded as skipped_cooldown and NOT sent', async () => {
    const t = build();
    await t.sms.onCandidate(high());
    t.advance(10 * MIN);
    await t.sms.onCandidate(high({ value: 39, alertId: null }));

    assert.equal(t.calls.length, 1, 'no second send call');
    assert.equal(t.rows[1]?.status, 'skipped_cooldown');
    assert.match(t.rows[1].providerResponse ?? '', /texted at 14:00; cooldown 30 min/);
  });

  it('a crossing after the cooldown is sent again', async () => {
    const t = build();
    await t.sms.onCandidate(high());
    t.advance(30 * MIN);
    await t.sms.onCandidate(high());
    assert.equal(t.calls.length, 2);
    assert.deepEqual(
      t.rows.map((r) => r.status),
      ['sent', 'sent'],
    );
  });

  it('the cooldown is per sensor AND condition', async () => {
    const t = build();
    await t.sms.onCandidate(high());
    await t.sms.onCandidate(high({ condition: 'LOW', value: 9, limit: 15 }));
    await t.sms.onCandidate(high({ metric: 'humidity', value: 97, limit: 85 }));
    assert.equal(t.calls.length, 3);
  });

  it('back to normal: one SMS, only after a texted HIGH/LOW', async () => {
    const t = build();
    await t.sms.onCandidate(normal()); // nothing was announced
    assert.equal(t.calls.length, 0);
    assert.equal(t.rows.length, 0);

    await t.sms.onCandidate(high());
    t.advance(5 * MIN);
    await t.sms.onCandidate(normal());
    assert.equal(t.calls.length, 2);
    assert.equal(t.calls[1]?.text, '[Greenhouse] Air temp back to normal: 33C at 14:05');
    assert.equal(t.rows[1]?.condition, 'NORMAL');
    assert.equal(t.rows[1].kind, 'recovery');

    await t.sms.onCandidate(normal()); // already closed
    assert.equal(t.calls.length, 2);
  });

  it('no back-to-normal for a crossing that was only skipped', async () => {
    const t = build();
    await t.sms.onCandidate(high()); // sent 14:00
    t.advance(2 * MIN);
    await t.sms.onCandidate(normal()); // sent 14:02
    t.advance(3 * MIN);
    await t.sms.onCandidate(high()); // skipped (cooldown)
    t.advance(1 * MIN);
    await t.sms.onCandidate(normal()); // the owner already knows it's normal
    assert.equal(t.calls.length, 2);
    assert.deepEqual(
      t.rows.map((r) => r.status),
      ['sent', 'sent', 'skipped_cooldown'],
    );
  });

  it('a provider error is recorded as failed and starts no cooldown', async () => {
    const t = build({
      reply: () => ({ ok: false, providerResponse: 'HTTP 401: nope', attempts: 1 }),
    });
    await t.sms.onCandidate(high());
    assert.equal(t.rows[0]?.status, 'failed');
    assert.equal(t.rows[0].providerResponse, 'HTTP 401: nope');
    await t.sms.onCandidate(high()); // retried by the next crossing
    assert.equal(t.calls.length, 2);
  });

  it('a provider that throws (or times out) still ends as a failed row, never an exception', async () => {
    const t = build({
      reply: () => Promise.reject(new Error('timeout after 10 s')),
    });
    await assert.doesNotReject(t.sms.onCandidate(high()));
    assert.equal(t.rows[0]?.status, 'failed');
    assert.equal(t.rows[0].providerResponse, 'timeout after 10 s');
  });

  it('dry run never calls the provider, records "dry_run" and still applies the cooldown', async () => {
    const t = build({ dryRun: true });
    await t.sms.onCandidate(high());
    t.advance(MIN);
    await t.sms.onCandidate(high());
    const outcome = await t.sms.sendTest();
    assert.equal(t.calls.length, 0, 'provider never called');
    assert.deepEqual(
      t.rows.map((r) => r.status),
      ['dry_run', 'skipped_cooldown', 'dry_run'],
    );
    assert.equal(outcome.outcome, 'done');
  });

  it('no numbers = no SMS at all', async () => {
    const t = build({ recipients: [] });
    await t.sms.onCandidate(high());
    await t.sms.sweep();
    assert.deepEqual(await t.sms.sendTest(), { outcome: 'no-recipients' });
    assert.equal(t.calls.length, 0);
    assert.equal(t.rows.length, 0);
  });

  it('the daily cap stops real SMS (recorded as skipped_daily_cap)', async () => {
    const t = build({ dailyCap: 2 });
    await t.sms.onCandidate(high());
    await t.sms.onCandidate(high({ metric: 'humidity', value: 97, limit: 85 }));
    await t.sms.onCandidate(
      high({ metric: 'soilMoisture', condition: 'LOW', value: 10, limit: 30 }),
    );
    assert.equal(t.calls.length, 2);
    assert.equal(t.rows[2]?.status, 'skipped_daily_cap');
    t.advance(24 * 60 * MIN + MIN); // the window is inclusive: exactly 24 h still counts
    await t.sms.onCandidate(high({ metric: 'lux', value: 90_000, limit: 50_000 }));
    assert.equal(t.calls.length, 3, 'a rolling 24 h window');
  });
});

describe('test SMS (POST /api/alerts/test)', () => {
  it('goes to every number, ignores the daily cap, at most 5 per hour', async () => {
    const t = build({ dailyCap: 1 });
    await t.sms.onCandidate(high()); // uses the whole daily cap
    for (let i = 0; i < TEST_LIMIT_PER_HOUR; i++) {
      const r = await t.sms.sendTest();
      assert.equal(r.outcome === 'done' ? r.attempt.status : r.outcome, 'sent');
    }
    assert.equal(t.calls[1]?.text, '[Greenhouse] Test message: SMS alerts are working (14:00)');
    assert.deepEqual(t.calls[1].recipients, NUMBERS);
    assert.deepEqual(await t.sms.sendTest(), { outcome: 'throttled' });
    t.advance(60 * MIN + MIN);
    assert.equal((await t.sms.sendTest()).outcome, 'done');
  });
});

describe('offline / back online SMS (sweep)', () => {
  function withDevice(t: ReturnType<typeof build>, over: Partial<DeviceInfo> = {}) {
    const device = {
      id: 'gh-01',
      name: 'Greenhouse 01',
      online: false,
      lastSeen: new Date(T0),
      ...over,
    };
    t.devices.set('gh-01', device);
    t.alertIds.set('gh-01:offline', 41);
    t.alertIds.set('gh-01:online', 42);
    return device;
  }

  it('announces an outage once, after SMS_OFFLINE_AFTER_MINUTES, linked to the offline alert', async () => {
    const t = build();
    withDevice(t);
    t.advance(9 * MIN);
    await t.sms.sweep();
    assert.equal(t.calls.length, 0);
    t.advance(MIN);
    await t.sms.sweep();
    assert.equal(t.calls.length, 1);
    assert.equal(
      t.calls[0]?.text,
      '[Greenhouse] Greenhouse 01 OFFLINE: no data for 10 min (last seen 14:00)',
    );
    assert.equal(t.rows[0]?.alertId, 41);
    t.advance(MIN);
    await t.sms.sweep();
    assert.equal(t.calls.length, 1, 'once per outage');
  });

  it('back online: one closing SMS', async () => {
    const t = build();
    const device = withDevice(t);
    t.advance(10 * MIN);
    await t.sms.sweep();
    t.advance(2 * MIN);
    device.online = true;
    device.lastSeen = new Date(T0 + 12 * MIN);
    await t.sms.sweep();
    await t.sms.sweep();
    assert.equal(t.calls.length, 2);
    assert.equal(t.calls[1]?.text, '[Greenhouse] Greenhouse 01 back ONLINE at 14:12');
    assert.equal(t.rows[1]?.alertId, 42);
  });

  it('a failed outage SMS is retried every 15 minutes, not on every sweep', async () => {
    const t = build({ reply: () => ({ ok: false, providerResponse: 'HTTP 500', attempts: 2 }) });
    withDevice(t);
    t.advance(10 * MIN);
    await t.sms.sweep();
    t.advance(MIN);
    await t.sms.sweep();
    assert.equal(t.calls.length, 1);
    t.advance(RETRY_FAILED_MS);
    await t.sms.sweep();
    assert.equal(t.calls.length, 2);
  });

  it('ignores devices never seen and outages older than 24 h', async () => {
    const never = build();
    withDevice(never, { lastSeen: null });
    never.advance(30 * MIN);
    await never.sms.sweep();
    assert.equal(never.calls.length, 0);

    const old = build();
    withDevice(old);
    old.advance(OFFLINE_MAX_AGE_MS + MIN);
    await old.sms.sweep();
    assert.equal(old.calls.length, 0);
  });
});
