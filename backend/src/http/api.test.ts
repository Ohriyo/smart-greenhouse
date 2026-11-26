// Database-backed: needs TEST_DATABASE_URL (backend/.env.test). First import = test env.
import {
  dbSkip,
  migrateTestDb,
  postReading,
  resetDb,
  startTestServer,
  TEST_ADMIN_KEY,
  TEST_ORIGIN,
  type TestServer,
} from '../test/server.js';

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { z } from 'zod';
import { prisma } from '../db.js';

const MIN = 60_000;
const ISO = z.iso.datetime();

const ReadingSchema = z.object({
  id: z.number().int(),
  deviceId: z.string(),
  ts: ISO,
  airTemp: z.number().nullable(),
  humidity: z.number().nullable(),
  soilMoisture: z.number().nullable(),
  soilRaw: z.number().nullable(),
  lux: z.number().nullable(),
  rssi: z.number().nullable(),
});
const ErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

const reading = (over: Record<string, unknown> = {}) => ({
  temperature: 27.4,
  humidity: 61.2,
  soilMoisture: 43,
  lux: 812.5,
  ...over,
});

/** Inserts readings directly (known timestamps) for the read endpoints. */
async function seed(
  rows: { minutesAgo: number; airTemp: number | null; humidity?: number | null }[],
) {
  await prisma.device.create({
    data: { id: 'gh-01', name: 'gh-01', thresholds: { create: {} } },
  });
  const now = Date.now();
  await prisma.reading.createMany({
    data: rows.map((r, i) => ({
      deviceId: 'gh-01',
      ts: new Date(now - r.minutesAgo * MIN),
      airTemp: r.airTemp,
      humidity: r.humidity === undefined ? 60 : r.humidity,
      soilMoisture: 40,
      lux: 100 * (i + 1),
    })),
  });
}

describe('HTTP API on PostgreSQL', { skip: dbSkip }, () => {
  let t: TestServer;
  before(() => {
    migrateTestDb();
  });
  beforeEach(async () => {
    await resetDb();
    t = await startTestServer();
  });
  afterEach(async () => {
    await t.settle();
    await t.close();
  });
  after(async () => {
    await prisma.$disconnect();
  });

  describe('GET /health', () => {
    it('200 with status, db and time', async () => {
      const res = await fetch(`${t.base}/health`);
      assert.equal(res.status, 200);
      const body = z
        .object({ status: z.literal('ok'), db: z.literal('ok'), time: ISO })
        .parse(await res.json());
      assert.ok(Math.abs(Date.parse(body.time) - Date.now()) < 60_000);
    });
  });

  describe('POST /api/readings', () => {
    it('a valid reading → 201, stored, and the device registers itself', async () => {
      const res = await postReading(t.base, reading({ rssi: -61, intervalSec: 30 }));
      assert.equal(res.status, 201);
      const body = z
        .object({ reading: ReadingSchema, commands: z.array(z.unknown()) })
        .parse(await res.json());
      assert.equal(body.reading.airTemp, 27.4, '"temperature" is stored as airTemp');
      assert.deepEqual(body.commands, []);

      const stored = await prisma.reading.findMany();
      assert.equal(stored.length, 1);
      assert.equal(stored[0]?.humidity, 61.2);
      assert.equal(stored[0].rssi, -61);
      const device = await prisma.device.findUnique({ where: { id: 'gh-01' } });
      assert.equal(device?.online, true);
      assert.equal(device.telemetryIntervalSec, 30);
    });

    it('accepts "airTemp" as the temperature field, and null for a failed sensor', async () => {
      const a = await postReading(t.base, { airTemp: 25, humidity: 50, soilMoisture: 40, lux: 10 });
      assert.equal(a.status, 201);
      const b = await postReading(
        t.base,
        reading({ temperature: null, humidity: null, errors: ['dht'] }),
      );
      assert.equal(b.status, 201);
      const rows = await prisma.reading.findMany({ orderBy: { id: 'asc' } });
      assert.deepEqual(
        rows.map((r) => [r.airTemp, r.humidity]),
        [
          [25, 50],
          [null, null],
        ],
      );
    });

    it('a missing or wrong X-Device-Key → 401, nothing stored', async () => {
      for (const key of [null, 'wrong-key', '']) {
        const res = await postReading(t.base, reading(), key);
        assert.equal(res.status, 401, `key ${JSON.stringify(key)}`);
        assert.equal(ErrorSchema.parse(await res.json()).error.code, 'UNAUTHORIZED');
      }
      assert.equal(await prisma.reading.count(), 0);
    });

    it('invalid or out-of-range values → 400 with the field, nothing stored', async () => {
      const cases: [Record<string, unknown>, string][] = [
        [reading({ temperature: 200 }), 'temperature'],
        [reading({ humidity: -5 }), 'humidity'],
        [reading({ soilMoisture: '43' }), 'soilMoisture'],
        [reading({ lux: 250_000 }), 'lux'],
        [{ temperature: 27, humidity: 60, soilMoisture: 40 }, 'lux'], // missing
        [{ humidity: 60, soilMoisture: 40, lux: 1 }, 'temperature'], // missing
        [reading({ airTemp: 27 }), 'airTemp'], // both names
        [reading({ deviceId: 'bad id!' }), 'deviceId'],
        [reading({ rssi: 12 }), 'rssi'],
      ];
      for (const [body, field] of cases) {
        const res = await postReading(t.base, body);
        assert.equal(res.status, 400, JSON.stringify(body));
        const err = ErrorSchema.parse(await res.json()).error;
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.ok(
          err.details?.some((d) => d.path === field),
          `${field} named in ${JSON.stringify(err.details)}`,
        );
      }
      const notJson = await postReading(t.base, '{"temperature": nan}');
      assert.equal(notJson.status, 400);
      assert.equal(ErrorSchema.parse(await notJson.json()).error.code, 'INVALID_JSON');
      assert.equal(await prisma.reading.count(), 0);
    });
  });

  describe('reading endpoints', () => {
    it('GET /api/readings/latest: nulls before the first reading, then the newest one', async () => {
      const LatestSchema = z.object({
        device: z.object({ id: z.string(), online: z.boolean() }).loose().nullable(),
        reading: ReadingSchema.nullable(),
      });
      const empty = LatestSchema.parse(await (await fetch(`${t.base}/api/readings/latest`)).json());
      assert.deepEqual(empty, { device: null, reading: null });

      await postReading(t.base, reading({ temperature: 20 }));
      await postReading(t.base, reading({ temperature: 21.5 }));
      const res = await fetch(`${t.base}/api/readings/latest`);
      assert.equal(res.status, 200);
      const latest = LatestSchema.parse(await res.json());
      assert.equal(latest.device?.id, 'gh-01');
      assert.equal(latest.reading?.airTemp, 21.5);
    });

    it('GET /api/readings?range=1h: time-ordered (oldest first), right shape, window respected', async () => {
      await seed([
        { minutesAgo: 10, airTemp: 30 },
        { minutesAgo: 50, airTemp: 10 },
        { minutesAgo: 30, airTemp: 20 },
        { minutesAgo: 90, airTemp: 99 }, // outside 1h
      ]);
      const res = await fetch(`${t.base}/api/readings?range=1h`);
      assert.equal(res.status, 200);
      const body = z
        .object({
          deviceId: z.literal('gh-01'),
          range: z.literal('1h'),
          from: ISO,
          to: ISO,
          bucketMs: z.number().int().positive(),
          points: z.array(
            z.object({
              ts: ISO,
              airTemp: z.number().nullable(),
              humidity: z.number().nullable(),
              soilMoisture: z.number().nullable(),
              lux: z.number().nullable(),
              count: z.number().int(),
            }),
          ),
        })
        .parse(await res.json());
      assert.deepEqual(
        body.points.map((p) => p.airTemp),
        [10, 20, 30],
      );
      const times = body.points.map((p) => Date.parse(p.ts));
      assert.deepEqual(
        times,
        [...times].sort((a, b) => a - b),
      );
    });

    it('GET /api/stats: min / max / avg per sensor match the seeded data', async () => {
      await seed([
        { minutesAgo: 5, airTemp: 20, humidity: 50 },
        { minutesAgo: 60, airTemp: 25, humidity: null },
        { minutesAgo: 600, airTemp: 30, humidity: 70 },
        { minutesAgo: 25 * 60, airTemp: 99, humidity: 99 }, // outside 24h
      ]);
      const res = await fetch(`${t.base}/api/stats?range=24h`);
      assert.equal(res.status, 200);
      const Stat = z.object({
        min: z.number().nullable(),
        max: z.number().nullable(),
        avg: z.number().nullable(),
        count: z.number().int(),
      });
      const body = z
        .object({
          deviceId: z.literal('gh-01'),
          range: z.literal('24h'),
          count: z.number().int(),
          stats: z.object({ airTemp: Stat, humidity: Stat, soilMoisture: Stat, lux: Stat }),
        })
        .parse(await res.json());
      assert.equal(body.count, 3);
      assert.deepEqual(body.stats.airTemp, { min: 20, max: 30, avg: 25, count: 3 });
      assert.deepEqual(body.stats.humidity, { min: 50, max: 70, avg: 60, count: 2 });
      assert.deepEqual(body.stats.soilMoisture, { min: 40, max: 40, avg: 40, count: 3 });
      assert.deepEqual(body.stats.lux, { min: 100, max: 300, avg: 200, count: 3 });
    });

    it('a bad range → 400', async () => {
      for (const path of ['/api/readings?range=2h', '/api/stats?range=forever']) {
        const res = await fetch(`${t.base}${path}`);
        assert.equal(res.status, 400, path);
      }
    });
  });

  describe('GET/PUT /api/thresholds', () => {
    it('404 before any device; defaults after the first reading; full replacement on PUT', async () => {
      assert.equal((await fetch(`${t.base}/api/thresholds`)).status, 404);
      await postReading(t.base, reading());
      const defaults = z
        .object({ airTempMin: z.number(), airTempMax: z.number() })
        .loose()
        .parse(await (await fetch(`${t.base}/api/thresholds`)).json());
      assert.deepEqual([defaults.airTempMin, defaults.airTempMax], [15, 35]);

      const next = {
        airTempMin: 12,
        airTempMax: 36,
        humidityMin: 40,
        humidityMax: 85,
        soilMoistureMin: 30,
        soilMoistureMax: 80,
        luxMin: null,
        luxMax: null,
      };
      const put = await fetch(`${t.base}/api/thresholds`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      assert.equal(put.status, 200);
      const saved = await prisma.thresholds.findUnique({ where: { deviceId: 'gh-01' } });
      assert.equal(saved?.airTempMax, 36);

      const bad = await fetch(`${t.base}/api/thresholds`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...next, airTempMin: 40 }),
      });
      assert.equal(bad.status, 400);
    });
  });

  describe('CORS', () => {
    it('the configured origin (and localhost) get Access-Control-Allow-Origin; others do not', async () => {
      const preflight = (origin: string) =>
        fetch(`${t.base}/api/readings/latest`, {
          method: 'OPTIONS',
          headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
        });
      const allowed = await preflight(TEST_ORIGIN);
      assert.equal(allowed.status, 204);
      assert.equal(allowed.headers.get('access-control-allow-origin'), TEST_ORIGIN);
      assert.match(allowed.headers.get('access-control-allow-methods') ?? '', /GET/);

      const local = await preflight('http://localhost:8081');
      assert.equal(local.headers.get('access-control-allow-origin'), 'http://localhost:8081');

      const other = await preflight('https://evil.example');
      assert.equal(other.headers.get('access-control-allow-origin'), null);

      const get = await fetch(`${t.base}/health`, { headers: { Origin: TEST_ORIGIN } });
      assert.equal(get.headers.get('access-control-allow-origin'), TEST_ORIGIN);
    });
  });

  describe('device commands', () => {
    it('soil calibration is delivered once, in the response to the next reading', async () => {
      await postReading(t.base, reading());
      const cal = await fetch(`${t.base}/api/devices/gh-01/soil-calibration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ point: 'dry' }),
      });
      assert.equal(cal.status, 202);

      const Commands = z.object({ commands: z.array(z.object({ type: z.string() }).loose()) });
      const next = Commands.parse(await (await postReading(t.base, reading())).json());
      assert.deepEqual(
        next.commands.map((c) => [c.type, c.point]),
        [['calibrateSoil', 'dry']],
      );
      const after = Commands.parse(await (await postReading(t.base, reading())).json());
      assert.deepEqual(after.commands, []);
    });
  });

  describe('errors', () => {
    it('unknown routes are JSON 404s; the admin test endpoint needs its key', async () => {
      const res = await fetch(`${t.base}/api/nope`);
      assert.equal(res.status, 404);
      assert.equal(ErrorSchema.parse(await res.json()).error.code, 'NOT_FOUND');

      const noKey = await fetch(`${t.base}/api/alerts/test`, { method: 'POST' });
      assert.equal(noKey.status, 401);
      const wrongKey = await fetch(`${t.base}/api/alerts/test`, {
        method: 'POST',
        headers: { 'X-Admin-Key': `${TEST_ADMIN_KEY}x` },
      });
      assert.equal(wrongKey.status, 401);
    });
  });
});
