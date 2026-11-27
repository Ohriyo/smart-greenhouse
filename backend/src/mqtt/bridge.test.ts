// Database-backed: needs TEST_DATABASE_URL (backend/.env.test). First import = test env.
import {
  dbSkip,
  migrateTestDb,
  postReading,
  resetDb,
  startTestServer,
  type TestServer,
} from '../test/server.js';

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { z } from 'zod';
import { closeDatabase, prisma } from '../db.js';
import type { CommandPublisher } from '../ingest/commands.js';

const reading = (over: Record<string, unknown> = {}) => ({
  temperature: 27.4,
  humidity: 61.2,
  soilMoisture: 43,
  lux: 812.5,
  intervalSec: 30,
  ...over,
});

const LatestSchema = z.object({
  device: z
    .object({ id: z.string(), online: z.boolean(), transport: z.string().nullable() })
    .loose()
    .nullable(),
  reading: z.object({ airTemp: z.number().nullable() }).loose().nullable(),
});

/** A broker stand-in: records what the backend publishes. */
function fakeBroker() {
  const published: { deviceId: string; type: string; point?: string }[] = [];
  const publisher: CommandPublisher = {
    isConnected: () => true,
    publish: (deviceId, command) => {
      published.push({
        deviceId,
        type: command.type,
        ...(command.type === 'calibrateSoil' ? { point: command.point } : {}),
      });
      return Promise.resolve();
    },
  };
  return { publisher, published };
}

async function waitFor(check: () => Promise<boolean> | boolean, timeoutMs = 3000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > until) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('MQTT ingest on PostgreSQL', { skip: dbSkip }, () => {
  let t: TestServer;
  let broker: ReturnType<typeof fakeBroker>;
  before(() => {
    migrateTestDb();
  });
  beforeEach(async () => {
    await resetDb();
    broker = fakeBroker();
    t = await startTestServer({ publisher: broker.publisher, lastWillGraceMs: 50 });
  });
  afterEach(async () => {
    await t.settle();
    await t.close();
  });
  after(async () => {
    await closeDatabase();
  });

  const send = (topic: string, payload: unknown, retained = false) => {
    t.bridge.handleMessage(
      topic,
      Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)),
      retained,
    );
  };
  const latest = async () =>
    LatestSchema.parse(await (await fetch(`${t.base}/api/readings/latest`)).json());

  it('stores telemetry like POST /api/readings, with the device id from the topic', async () => {
    send('greenhouse/gh-01/telemetry', reading());
    await t.settle();
    const body = await latest();
    assert.equal(body.reading?.airTemp, 27.4);
    assert.ok(body.device);
    assert.equal(body.device.id, 'gh-01');
    assert.equal(body.device.online, true);
    assert.equal(body.device.transport, 'mqtt');

    // The ESP32's HTTPS fallback: same pipeline, transport switches.
    assert.equal((await postReading(t.base, reading({ temperature: 28 }))).status, 201);
    await t.settle();
    assert.equal((await latest()).device?.transport, 'https');
  });

  it('drops invalid telemetry and telemetry naming another device', async () => {
    send('greenhouse/gh-01/telemetry', 'not json');
    send('greenhouse/gh-01/telemetry', reading({ humidity: 140 }));
    send('greenhouse/gh-01/telemetry', reading({ deviceId: 'gh-02' }));
    send('greenhouse/gh-01/command', reading()); // never subscribed; ignored anyway
    await t.settle();
    assert.equal(await prisma.reading.count(), 0);
  });

  it('publishes soil calibration at once to a device on MQTT', async () => {
    send('greenhouse/gh-01/telemetry', reading());
    await t.settle();
    const res = await fetch(`${t.base}/api/devices/gh-01/soil-calibration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ point: 'wet' }),
    });
    assert.equal(res.status, 202);
    const body = z
      .object({ status: z.literal('queued'), delivery: z.string() })
      .parse(await res.json());
    assert.equal(body.delivery, 'mqtt');
    assert.deepEqual(broker.published, [
      { deviceId: 'gh-01', type: 'calibrateSoil', point: 'wet' },
    ]);
  });

  it('a command queued while on HTTPS goes out over MQTT after the next MQTT reading', async () => {
    assert.equal((await postReading(t.base, reading())).status, 201);
    await t.settle();
    const res = await fetch(`${t.base}/api/devices/gh-01/soil-calibration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ point: 'dry' }),
    });
    assert.equal(z.object({ delivery: z.string() }).parse(await res.json()).delivery, 'queued');
    assert.deepEqual(broker.published, []);

    send('greenhouse/gh-01/telemetry', reading());
    await t.settle();
    await waitFor(() => broker.published.length === 1);
    assert.deepEqual(broker.published, [
      { deviceId: 'gh-01', type: 'calibrateSoil', point: 'dry' },
    ]);
  });

  it('Last Will: offline after one interval + grace when no reading follows', async () => {
    send('greenhouse/gh-01/telemetry', reading({ intervalSec: 1 }));
    await t.settle();
    send('greenhouse/gh-01/status', 'offline');
    await waitFor(async () => (await latest()).device?.online === false);
    await t.settle();
    const alerts = await prisma.alert.findMany({ where: { type: 'offline' } });
    assert.equal(alerts.length, 1);
    assert.match(alerts[0]?.message ?? '', /MQTT connection was lost/);
  });

  it('Last Will followed by an HTTPS reading (the fallback) keeps the device online', async () => {
    send('greenhouse/gh-01/telemetry', reading({ intervalSec: 1 }));
    await t.settle();
    send('greenhouse/gh-01/status', 'offline');
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal((await postReading(t.base, reading({ intervalSec: 1 }))).status, 201);
    await t.settle();
    await new Promise((resolve) => setTimeout(resolve, 1200)); // past interval + grace
    assert.equal((await latest()).device?.online, true);
    assert.equal(await prisma.alert.count({ where: { type: 'offline' } }), 0);
  });

  it('retained status messages (replayed on subscribe) never change presence', async () => {
    send('greenhouse/gh-01/telemetry', reading({ intervalSec: 1 }));
    await t.settle();
    send('greenhouse/gh-01/status', 'offline', true);
    send('greenhouse/gh-02/status', 'online', true);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.equal((await latest()).device?.online, true);
    assert.equal(await prisma.device.count(), 1); // no device created from a retained message
  });

  it('/health reports the broker connection', async () => {
    const health = z
      .object({ mqtt: z.string() })
      .loose()
      .parse(await (await fetch(`${t.base}/health`)).json());
    assert.equal(health.mqtt, 'connected');
  });
});
