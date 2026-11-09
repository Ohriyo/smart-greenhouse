import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  ExpoPushMessage,
  ExpoPushReceipt,
  ExpoPushReceiptId,
  ExpoPushTicket,
} from 'expo-server-sdk';
import type { AlertDto } from '../domain/dto.js';
import { ALERT_CHANNEL_ID, createPushSender, shouldPush, type PushClient } from './sender.js';

const alert = (severity: AlertDto['severity']): AlertDto => ({
  id: 7,
  deviceId: 'gh-01',
  ts: '2026-11-09T10:00:00.000Z',
  type: 'above_max',
  severity,
  metric: 'airTemp',
  value: 39,
  limit: 35,
  message: 'Air temperature very high: 39 °C (max 35 °C)',
  readAt: null,
});

/** Fake Expo client: chunks of 2, scripted tickets/receipts per token. */
function fakeClient(
  ticketFor: (token: string) => ExpoPushTicket,
  receipts: Record<string, ExpoPushReceipt> = {},
) {
  const sent: ExpoPushMessage[][] = [];
  const client: PushClient = {
    chunkPushNotifications: (m) => {
      const out: ExpoPushMessage[][] = [];
      for (let i = 0; i < m.length; i += 2) out.push(m.slice(i, i + 2));
      return out;
    },
    sendPushNotificationsAsync: (chunk) => {
      sent.push(chunk);
      return Promise.resolve(chunk.map((m) => ticketFor(String(m.to))));
    },
    chunkPushNotificationReceiptIds: (ids: ExpoPushReceiptId[]) => [ids],
    getPushNotificationReceiptsAsync: (ids) =>
      Promise.resolve(
        Object.fromEntries(ids.flatMap((id) => (receipts[id] ? [[id, receipts[id]]] : []))),
      ),
  };
  return { client, sent };
}

function fakeStore(tokens: string[], settings = { enabled: true, minSeverity: 'warning' }) {
  const removed: string[] = [];
  return {
    removed,
    store: {
      getSettings: () => Promise.resolve(settings),
      listTokens: () => Promise.resolve(tokens.filter((t) => !removed.includes(t))),
      removeTokens: (t: string[]) => {
        removed.push(...t);
        return Promise.resolve(t.length);
      },
    },
  };
}

const ok = (id: string): ExpoPushTicket => ({ status: 'ok', id });
const notRegistered: ExpoPushTicket = {
  status: 'error',
  message: 'not a registered push notification recipient',
  details: { error: 'DeviceNotRegistered' },
};

describe('shouldPush', () => {
  it('respects enabled and the minimum severity', () => {
    assert.equal(shouldPush('warning', { enabled: true, minSeverity: 'warning' }), true);
    assert.equal(shouldPush('critical', { enabled: true, minSeverity: 'warning' }), true);
    assert.equal(shouldPush('info', { enabled: true, minSeverity: 'warning' }), false);
    assert.equal(shouldPush('warning', { enabled: true, minSeverity: 'critical' }), false);
    assert.equal(shouldPush('info', { enabled: true, minSeverity: 'info' }), true);
    assert.equal(shouldPush('critical', { enabled: false, minSeverity: 'info' }), false);
  });
});

describe('push sender', () => {
  it('sends one high-priority message per token on the alerts channel, in chunks', async () => {
    const tokens = ['ExponentPushToken[a]', 'ExponentPushToken[b]', 'ExponentPushToken[c]'];
    const { client, sent } = fakeClient((t) => ok(`r-${t}`));
    const { store } = fakeStore(tokens);
    const push = createPushSender({ client, store, enabled: true });

    const result = await push.notifyAlert(alert('critical'));
    push.stop();

    assert.deepEqual(result, { tokens: 3, sent: 3, failed: 0, removed: 0 });
    assert.equal(sent.length, 2); // 2 + 1
    const msg = sent[0]?.[0];
    assert.ok(msg);
    assert.equal(msg.channelId, ALERT_CHANNEL_ID);
    assert.equal(msg.priority, 'high');
    // Same title for every severity: the body carries the alert's own wording.
    assert.equal(msg.title, 'Greenhouse alert');
    assert.equal(msg.body, 'Air temperature very high: 39 °C (max 35 °C)');
    assert.deepEqual(msg.data, { url: '/alerts', alertId: 7, deviceId: 'gh-01' });
  });

  it('uses one title for every severity', async () => {
    const { client, sent } = fakeClient((t) => ok(t));
    // minSeverity "info": all three severities are pushed.
    const store = fakeStore(['ExponentPushToken[a]'], { enabled: true, minSeverity: 'info' }).store;
    const push = createPushSender({ client, store, enabled: true });
    for (const severity of ['info', 'warning', 'critical'] as const) {
      await push.notifyAlert(alert(severity));
    }
    push.stop();
    assert.deepEqual(
      sent.flat().map((m) => m.title),
      ['Greenhouse alert', 'Greenhouse alert', 'Greenhouse alert'],
    );
  });

  it('test notification: plain text by default, the prototype sample with the demo preset', async () => {
    const { client, sent } = fakeClient((t) => ok(t));
    const push = createPushSender({
      client,
      store: fakeStore(['ExponentPushToken[a]']).store,
      enabled: true,
    });
    await push.sendTest();
    await push.sendTest('demo');
    push.stop();
    const [plain, demo] = sent.flat();
    assert.ok(plain && demo);
    assert.equal(plain.title, 'ETanim');
    assert.match(String(plain.body), /push alerts work/);
    assert.equal(demo.title, 'Greenhouse alert');
    assert.equal(demo.body, 'Air temperature 33.1 °C — fan turned on');
    assert.deepEqual(demo.data, { url: '/alerts' });
    assert.equal(demo.channelId, ALERT_CHANNEL_ID);
  });

  it('skips alerts below the minimum severity and when disabled', async () => {
    const { client, sent } = fakeClient((t) => ok(t));
    const below = createPushSender({
      client,
      store: fakeStore(['ExponentPushToken[a]']).store,
      enabled: true,
    });
    assert.equal(await below.notifyAlert(alert('info')), null);
    const off = createPushSender({
      client,
      store: fakeStore(['ExponentPushToken[a]']).store,
      enabled: false,
    });
    assert.equal(await off.notifyAlert(alert('critical')), null);
    assert.equal(sent.length, 0);
  });

  it('removes tokens whose ticket says DeviceNotRegistered', async () => {
    const { client } = fakeClient((t) => (t.endsWith('[dead]') ? notRegistered : ok(t)));
    const { store, removed } = fakeStore(['ExponentPushToken[live]', 'ExponentPushToken[dead]']);
    const push = createPushSender({ client, store, enabled: true });

    const result = await push.notifyAlert(alert('warning'));
    push.stop();

    assert.deepEqual(result, { tokens: 2, sent: 1, failed: 1, removed: 1 });
    assert.deepEqual(removed, ['ExponentPushToken[dead]']);
  });

  it('removes tokens whose receipt says DeviceNotRegistered', async () => {
    const { client } = fakeClient((t) => ok(`r-${t}`), {
      'r-ExponentPushToken[a]': { status: 'ok' },
      'r-ExponentPushToken[b]': {
        status: 'error',
        message: 'gone',
        details: { error: 'DeviceNotRegistered' },
      },
    });
    const { store, removed } = fakeStore(['ExponentPushToken[a]', 'ExponentPushToken[b]']);
    const push = createPushSender({ client, store, enabled: true });

    await push.notifyAlert(alert('warning'));
    await push.checkReceipts();
    push.stop();

    assert.deepEqual(removed, ['ExponentPushToken[b]']);
  });

  it('never throws when the Expo request fails (no internet)', async () => {
    const { store } = fakeStore(['ExponentPushToken[a]']);
    const client: PushClient = {
      ...fakeClient((t) => ok(t)).client,
      sendPushNotificationsAsync: () => Promise.reject(new Error('getaddrinfo ENOTFOUND exp.host')),
    };
    const push = createPushSender({ client, store, enabled: true });
    const result = await push.notifyAlert(alert('critical'));
    assert.deepEqual(result, { tokens: 1, sent: 0, failed: 1, removed: 0 });
  });
});
