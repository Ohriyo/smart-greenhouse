import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { AlertDto, FanStateDto } from '../domain/dto.js';
import {
  createSmsNotifier,
  EPISODE_MAX_AGE_MS,
  OFFLINE_MAX_AGE_MS,
  STABILIZE_TIMEOUT_MS,
  TEST_LIMIT_PER_HOUR,
  type SmsNotifier,
} from './notifier.js';
import type { SmsProvider } from './provider.js';
import type {
  DeviceInfo,
  EpisodeRow,
  LatestReadingInfo,
  NewSmsLog,
  SmsLogRow,
  SmsSettingsRow,
  SmsStore,
} from './store.js';

const MIN = 60_000;
const PHONE = '+639171234567';
const T0 = Date.UTC(2026, 10, 9, 6, 0); // 14:00 in Manila

interface LogEntry extends NewSmsLog {
  ts: Date;
}

/** In-memory SmsStore. */
function createFakeStore(clock: () => number) {
  const state = {
    settings: {
      enabled: true,
      phone: PHONE as string | null,
      offlineAfterMin: 10,
      updatedAt: new Date(T0),
    } satisfies SmsSettingsRow as SmsSettingsRow,
    logs: [] as LogEntry[],
    episodes: [] as (EpisodeRow & { closedAt: Date | null })[],
    devices: new Map<string, DeviceInfo>([
      ['gh-01', { id: 'gh-01', name: 'Greenhouse 01', online: true, lastSeen: new Date(T0) }],
    ]),
    readings: new Map<string, LatestReadingInfo>(),
    nextId: 1,
  };

  const store: SmsStore = {
    getSettings: () => Promise.resolve(state.settings),
    saveSettings: (body) => {
      state.settings = { ...state.settings, ...body, updatedAt: new Date(clock()) };
      return Promise.resolve(state.settings);
    },
    countSentSince: (since) =>
      Promise.resolve(
        state.logs.filter((l) => l.status === 'sent' && l.kind !== 'test' && l.ts >= since).length,
      ),
    countTestsSince: (since) =>
      Promise.resolve(state.logs.filter((l) => l.kind === 'test' && l.ts >= since).length),
    addLog: (entry) => {
      state.logs.push({ ...entry, ts: new Date(clock()) });
      return Promise.resolve();
    },
    lastLog: () => {
      const l = state.logs.at(-1);
      const row: SmsLogRow | null = l
        ? { ts: l.ts, kind: l.kind, status: l.status, error: l.error }
        : null;
      return Promise.resolve(row);
    },
    findOpenEpisode: (deviceId, metric) =>
      Promise.resolve(
        state.episodes.find((e) => e.deviceId === deviceId && e.metric === metric && !e.closedAt) ??
          null,
      ),
    listOpenEpisodes: () => Promise.resolve(state.episodes.filter((e) => !e.closedAt)),
    openEpisode: (deviceId, metric, at) => {
      state.episodes.push({
        id: state.nextId++,
        deviceId,
        metric,
        openedAt: at,
        recoveredAt: null,
        closedAt: null,
      });
      return Promise.resolve();
    },
    markRecovered: (id, at) => {
      const e = state.episodes.find((x) => x.id === id);
      if (e) e.recoveredAt = at;
      return Promise.resolve();
    },
    closeEpisode: (id, at) => {
      const e = state.episodes.find((x) => x.id === id);
      if (e) e.closedAt = at;
      return Promise.resolve();
    },
    getDevice: (id) => Promise.resolve(state.devices.get(id) ?? null),
    listDevices: () => Promise.resolve([...state.devices.values()]),
    latestReading: (deviceId) => Promise.resolve(state.readings.get(deviceId) ?? null),
  };
  return { store, state };
}

function alert(over: Partial<AlertDto>): AlertDto {
  return {
    id: 1,
    deviceId: 'gh-01',
    ts: new Date(T0).toISOString(),
    type: 'above_max',
    severity: 'critical',
    metric: 'airTemp',
    value: 38.4,
    limit: 35,
    message: '',
    readAt: null,
    ...over,
  };
}

const fanOff = (airTemp: number | null = 28): FanStateDto => ({
  deviceId: 'gh-01',
  ts: new Date(T0).toISOString(),
  fanOn: false,
  fanMode: 'auto',
  airTemp,
});

describe('SmsNotifier', () => {
  let now: number;
  let sent: { to: string; text: string }[];
  let failWith: string | null;
  let provider: SmsProvider;
  let fake: ReturnType<typeof createFakeStore>;
  let sms: SmsNotifier;

  const build = (dailyCap = 10) => {
    sms = createSmsNotifier({ store: fake.store, provider, dailyCap, clock: () => now });
  };

  beforeEach(() => {
    now = T0;
    sent = [];
    failWith = null;
    provider = {
      name: 'console',
      simulated: true,
      send: (to, text) => {
        if (failWith) return Promise.reject(new Error(failWith));
        sent.push({ to, text });
        return Promise.resolve({ id: `m${sent.length}` });
      },
    };
    fake = createFakeStore(() => now);
    fake.state.readings.set('gh-01', { airTemp: 38.4, fanOn: true, fanMode: 'auto' });
    build();
  });

  describe('critical air temperature and the fan', () => {
    it('the whole story: critical + fan ON, back in range, fan OFF = stabilized', async () => {
      // 1. critical while the fan runs in auto
      await sms.onAlert(alert({}));
      assert.equal(sent.length, 1);
      assert.equal(
        sent[0]?.text,
        'ETanim CRITICAL: Air temp 38.4 C (max 35). Fan ON (auto). Greenhouse 01',
      );
      assert.equal(sent[0].to, PHONE);

      // still critical: no repeats
      await sms.onAlert(alert({ value: 39.1 }));
      assert.equal(sent.length, 1);

      // 2. back in range, but the fan still runs (it turns off at 28): wait quietly
      fake.state.readings.set('gh-01', { airTemp: 34, fanOn: true, fanMode: 'auto' });
      await sms.onAlert(alert({ type: 'recovered', severity: 'info', value: 34, limit: null }));
      assert.equal(sent.length, 1, 'no SMS yet: the temperature is not stable');
      assert.ok(fake.state.episodes[0]?.recoveredAt, 'episode remembers it recovered');

      // 3. the fan switches off: stabilized
      fake.state.readings.set('gh-01', { airTemp: 28, fanOn: false, fanMode: 'auto' });
      await sms.onFanEvent(fanOff(28));
      assert.equal(sent.length, 2);
      assert.equal(
        sent[1]?.text,
        'ETanim OK: Air temp back to 28 C. Fan turned OFF. Greenhouse 01',
      );
      assert.ok(fake.state.episodes[0].closedAt, 'episode closed');

      // a later fan-off is nothing to report
      await sms.onFanEvent(fanOff(27));
      assert.equal(sent.length, 2);
    });

    it('fan forced OFF during the emergency: the SMS says so', async () => {
      fake.state.readings.set('gh-01', { airTemp: 39, fanOn: false, fanMode: 'off' });
      await sms.onAlert(alert({ value: 39 }));
      assert.match(sent[0]?.text ?? '', /Fan is OFF \(manual\)\. Turn it on in the app!/);
    });

    it('a manual "fan off" while still critical is not "stabilized"', async () => {
      await sms.onAlert(alert({}));
      await sms.onFanEvent(fanOff(37));
      assert.equal(sent.length, 1);
      assert.equal(fake.state.episodes[0]?.closedAt, null);
    });

    it('back in range with the fan held ON by hand: closes at once, fan still ON', async () => {
      await sms.onAlert(alert({}));
      fake.state.readings.set('gh-01', { airTemp: 33, fanOn: true, fanMode: 'on' });
      await sms.onAlert(alert({ type: 'recovered', severity: 'info', value: 33, limit: null }));
      assert.equal(sent.length, 2);
      assert.equal(
        sent[1]?.text,
        'ETanim OK: Air temp back to 33 C. Fan still ON (manual). Greenhouse 01',
      );
      assert.ok(fake.state.episodes[0]?.closedAt);
    });

    it('fan already off when the temperature is back: closes at once', async () => {
      await sms.onAlert(alert({}));
      fake.state.readings.set('gh-01', { airTemp: 27, fanOn: false, fanMode: 'auto' });
      await sms.onAlert(alert({ type: 'recovered', severity: 'info', value: 27, limit: null }));
      assert.equal(sent[1]?.text, 'ETanim OK: Air temp back to 27 C. Fan is OFF. Greenhouse 01');
    });

    it('fan never switches off after recovery: the sweep closes it after 2 hours', async () => {
      await sms.onAlert(alert({}));
      fake.state.readings.set('gh-01', { airTemp: 30, fanOn: true, fanMode: 'auto' });
      await sms.onAlert(alert({ type: 'recovered', severity: 'info', value: 30, limit: null }));
      assert.equal(sent.length, 1);

      now += STABILIZE_TIMEOUT_MS - MIN;
      await sms.sweep();
      assert.equal(sent.length, 1, 'not yet');

      now += 2 * MIN;
      await sms.sweep();
      assert.equal(sent.length, 2);
      assert.equal(
        sent[1]?.text,
        'ETanim OK: Air temp back to 30 C. Fan still ON (auto). Greenhouse 01',
      );
    });

    it('too cold is critical too, without a fan sentence', async () => {
      await sms.onAlert(alert({ type: 'below_min', value: 4.2, limit: 10 }));
      assert.equal(
        sent[0]?.text,
        'ETanim CRITICAL: Air temp 4.2 C (min 10). Too cold. Greenhouse 01',
      );
    });
  });

  describe('other sensors', () => {
    it('humidity, soil and light: critical SMS, then a closing SMS when back in range', async () => {
      await sms.onAlert(alert({ metric: 'humidity', value: 97, limit: 85 }));
      await sms.onAlert(alert({ metric: 'soilMoisture', type: 'below_min', value: 8, limit: 30 }));
      await sms.onAlert(alert({ metric: 'lux', value: 91000, limit: 60000 }));
      assert.equal(sent.length, 3);
      assert.ok(sent.every((m) => !m.text.includes('Fan')));

      await sms.onAlert(
        alert({ metric: 'humidity', type: 'recovered', severity: 'info', value: 62, limit: null }),
      );
      assert.equal(sent.length, 4);
      assert.equal(sent[3]?.text, 'ETanim OK: Humidity back in range: 62 %. Greenhouse 01');
      assert.equal(fake.state.episodes.filter((e) => !e.closedAt).length, 2);
    });
  });

  describe('when nothing is sent', () => {
    it('warnings are push-only', async () => {
      await sms.onAlert(alert({ severity: 'warning', value: 36 }));
      assert.equal(sent.length, 0);
      assert.equal(fake.state.episodes.length, 0);
    });

    it('a recovery of a warning (no SMS episode) stays silent', async () => {
      await sms.onAlert(alert({ type: 'recovered', severity: 'info', value: 33, limit: null }));
      assert.equal(sent.length, 0);
    });

    it('SMS turned off, or no number saved', async () => {
      fake.state.settings = { ...fake.state.settings, enabled: false };
      await sms.onAlert(alert({}));
      fake.state.settings = { ...fake.state.settings, enabled: true, phone: null };
      await sms.onAlert(alert({}));
      assert.equal(sent.length, 0);
      assert.equal(fake.state.episodes.length, 0);
      assert.equal(fake.state.logs.length, 0);
    });

    it('daily cap: skipped and logged, no episode, closing is also capped', async () => {
      build(2);
      await sms.onAlert(alert({ metric: 'humidity', value: 97, limit: 85 }));
      await sms.onAlert(alert({ metric: 'soilMoisture', type: 'below_min', value: 8, limit: 30 }));
      await sms.onAlert(alert({ metric: 'lux', value: 91000, limit: 60000 }));
      assert.equal(sent.length, 2);
      const last = fake.state.logs.at(-1);
      assert.equal(last?.status, 'skipped');
      assert.match(last.error ?? '', /daily limit of 2/);
      assert.equal(fake.state.episodes.length, 2, 'no episode for the skipped one');

      // the cap is a rolling 24 hours
      now += 25 * 60 * MIN;
      await sms.onAlert(alert({ metric: 'lux', value: 91000, limit: 60000 }));
      assert.equal(sent.length, 3);
    });

    it('provider failure: logged, no episode (the next critical alert tries again)', async () => {
      failWith = 'Semaphore answered HTTP 401';
      await sms.onAlert(alert({}));
      assert.equal(sent.length, 0);
      assert.equal(fake.state.logs[0]?.status, 'failed');
      assert.equal(fake.state.logs[0].error, 'Semaphore answered HTTP 401');
      assert.equal(fake.state.episodes.length, 0);

      failWith = null;
      await sms.onAlert(alert({}));
      assert.equal(sent.length, 1);
    });

    it('never throws into the alert pipeline, even if the database fails', async () => {
      fake.store.getSettings = () => Promise.reject(new Error('db down'));
      await assert.doesNotReject(sms.onAlert(alert({})));
      await assert.doesNotReject(sms.onFanEvent(fanOff()));
      await assert.doesNotReject(sms.sweep());
    });
  });

  describe('greenhouse offline', () => {
    const goOffline = (minutesAgo: number) => {
      fake.state.devices.set('gh-01', {
        id: 'gh-01',
        name: 'Greenhouse 01',
        online: false,
        lastSeen: new Date(now - minutesAgo * MIN),
      });
    };

    it('announces once after N minutes, then says it is back', async () => {
      goOffline(5);
      await sms.sweep();
      assert.equal(sent.length, 0, 'only 5 of 10 minutes');

      now += 6 * MIN; // 11 minutes of silence
      await sms.sweep();
      assert.equal(sent.length, 1);
      assert.equal(
        sent[0]?.text,
        'ETanim ALERT: Greenhouse 01 offline for 11 min (last seen 13:55). The fan keeps running on its own.',
      );

      now += 5 * MIN;
      await sms.sweep();
      await sms.sweep();
      assert.equal(sent.length, 1, 'one SMS per outage');

      fake.state.devices.set('gh-01', {
        id: 'gh-01',
        name: 'Greenhouse 01',
        online: true,
        lastSeen: new Date(now),
      });
      await sms.sweep();
      assert.equal(sent.length, 2);
      assert.equal(sent[1]?.text, 'ETanim OK: Greenhouse 01 is back online.');
      await sms.sweep();
      assert.equal(sent.length, 2);
    });

    it('uses the N minutes from the settings', async () => {
      fake.state.settings = { ...fake.state.settings, offlineAfterMin: 30 };
      goOffline(20);
      await sms.sweep();
      assert.equal(sent.length, 0);
      now += 11 * MIN;
      await sms.sweep();
      assert.equal(sent.length, 1);
    });

    it('does not announce an outage older than a day, or a device never seen', async () => {
      goOffline(OFFLINE_MAX_AGE_MS / MIN + 5);
      fake.state.devices.set('gh-chk', {
        id: 'gh-chk',
        name: 'gh-chk',
        online: false,
        lastSeen: null,
      });
      await sms.sweep();
      assert.equal(sent.length, 0);
    });

    it('an online device is never announced', async () => {
      await sms.sweep();
      assert.equal(sent.length, 0);
    });

    it('a failed offline SMS is retried by the next sweep', async () => {
      goOffline(15);
      failWith = 'no internet';
      await sms.sweep();
      assert.equal(sent.length, 0);
      failWith = null;
      await sms.sweep();
      assert.equal(sent.length, 1);
    });
  });

  describe('restart safety and housekeeping', () => {
    it('a new notifier on the same database continues an open episode', async () => {
      await sms.onAlert(alert({}));
      build(); // simulates a backend restart: all memory is gone, the database stays
      await sms.onAlert(alert({ value: 39 }));
      assert.equal(sent.length, 1, 'not announced twice');

      fake.state.readings.set('gh-01', { airTemp: 34, fanOn: true, fanMode: 'auto' });
      await sms.onAlert(alert({ type: 'recovered', severity: 'info', value: 34, limit: null }));
      build(); // restart while waiting for the fan
      fake.state.readings.set('gh-01', { airTemp: 28, fanOn: false, fanMode: 'auto' });
      await sms.onFanEvent(fanOff(28));
      assert.equal(sent.length, 2);
      assert.match(sent[1]?.text ?? '', /Fan turned OFF/);
    });

    it('an episode open for 48 hours is closed silently', async () => {
      await sms.onAlert(alert({}));
      now += EPISODE_MAX_AGE_MS + MIN;
      await sms.sweep();
      assert.equal(sent.length, 1);
      assert.ok(fake.state.episodes[0]?.closedAt);
      // a new critical situation can be announced again
      await sms.onAlert(alert({}));
      assert.equal(sent.length, 2);
    });

    it('housekeeping also runs while SMS is switched off', async () => {
      await sms.onAlert(alert({}));
      fake.state.settings = { ...fake.state.settings, enabled: false };
      now += EPISODE_MAX_AGE_MS + MIN;
      await sms.sweep();
      assert.ok(fake.state.episodes[0]?.closedAt);
    });
  });

  describe('test SMS and overview', () => {
    it('needs a saved number', async () => {
      fake.state.settings = { ...fake.state.settings, phone: null };
      assert.deepEqual(await sms.sendTest(), { outcome: 'no-phone' });
    });

    it('sends, ignores the on/off switch and the daily cap, and is throttled', async () => {
      build(1);
      fake.state.settings = { ...fake.state.settings, enabled: false };
      for (let i = 0; i < TEST_LIMIT_PER_HOUR; i++) {
        const r = await sms.sendTest();
        assert.deepEqual(r, { outcome: 'done', status: 'sent', error: null, simulated: true });
      }
      assert.deepEqual(await sms.sendTest(), { outcome: 'throttled' });
      assert.equal(sent.length, TEST_LIMIT_PER_HOUR);
      assert.equal(sent[0]?.text, 'ETanim test: SMS alerts are working.');

      now += 61 * MIN;
      assert.equal((await sms.sendTest()).outcome, 'done');
    });

    it('reports a failed test with its reason', async () => {
      failWith = 'Semaphore rejected the message: bad key';
      const r = await sms.sendTest();
      assert.deepEqual(r, {
        outcome: 'done',
        status: 'failed',
        error: 'Semaphore rejected the message: bad key',
        simulated: true,
      });
    });

    it('overview counts alert SMS (not tests) and shows the last result', async () => {
      await sms.onAlert(alert({ metric: 'humidity', value: 97, limit: 85 }));
      await sms.sendTest();
      const o = await sms.overview();
      assert.equal(o.sentLast24h, 1);
      assert.equal(o.dailyCap, 10);
      assert.equal(o.last?.kind, 'test');
      assert.deepEqual(o.provider, { name: 'console', simulated: true });
    });
  });
});
