// Database-backed: needs TEST_DATABASE_URL (backend/.env.test). First import = test env.
import {
  dbSkip,
  migrateTestDb,
  postReading,
  resetDb,
  startTestServer,
  TEST_ADMIN_KEY,
  TEST_NUMBERS,
  type TestServer,
} from '../test/server.js';

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { z } from 'zod';
import { closeDatabase, prisma } from '../db.js';
import { createSemaphoreProvider, type SmsProvider, type SmsSendResult } from './provider.js';

const MIN = 60_000;

/** A provider that records every send and answers `reply` (default: accepted). */
function recordingProvider(reply: () => SmsSendResult = () => accepted) {
  const calls: { recipients: string[]; text: string }[] = [];
  const provider: SmsProvider = {
    name: 'semaphore',
    send: (recipients, text) => {
      calls.push({ recipients: [...recipients], text });
      return Promise.resolve(reply());
    },
  };
  return { provider, calls };
}
const accepted: SmsSendResult = {
  ok: true,
  providerResponse: '[{"status":"Queued"}]',
  attempts: 1,
};

const normal = { temperature: 27.4, humidity: 61.2, soilMoisture: 43, lux: 812.5 };
const hot = { ...normal, temperature: 36 }; // default max 35 °C

const AlertsSchema = z.object({
  items: z.array(
    z
      .object({
        type: z.string(),
        sms: z
          .object({ status: z.string(), at: z.string(), detail: z.string().nullable() })
          .nullable(),
      })
      .loose(),
  ),
});

async function smsRows() {
  return prisma.smsAlert.findMany({ orderBy: { id: 'asc' } });
}

describe(
  'SMS alerts through the real pipeline (HTTP → rules → SMS log in PostgreSQL)',
  { skip: dbSkip },
  () => {
    let t: TestServer | undefined;
    before(() => {
      migrateTestDb();
    });
    beforeEach(async () => {
      await resetDb();
    });
    afterEach(async () => {
      await t?.settle();
      await t?.close();
      t = undefined;
    });
    after(async () => {
      await closeDatabase();
    });

    it('a reading inside the thresholds sends no SMS', async () => {
      const rec = recordingProvider();
      t = await startTestServer({ provider: rec.provider });
      assert.equal((await postReading(t.base, normal)).status, 201);
      await t.settle();
      assert.equal(rec.calls.length, 0);
      assert.equal((await smsRows()).length, 0);
    });

    it('crossing a threshold → exactly one send, to every number, with the right text; the alert shows "sent"', async () => {
      const rec = recordingProvider();
      t = await startTestServer({ provider: rec.provider });
      await postReading(t.base, normal);
      assert.equal((await postReading(t.base, hot)).status, 201);
      await t.settle();

      assert.equal(rec.calls.length, 1);
      assert.deepEqual(rec.calls[0]?.recipients, TEST_NUMBERS);
      assert.match(
        rec.calls[0].text,
        /^\[Greenhouse\] Air temp HIGH: 36C \(max 35C\) at \d\d:\d\d$/,
      );

      const [row] = await smsRows();
      assert.ok(row);
      assert.equal(row.status, 'sent');
      assert.equal(row.sensor, 'airTemp');
      assert.equal(row.condition, 'HIGH');
      assert.equal(row.value, 36);
      assert.equal(row.threshold, 35);
      assert.equal(row.recipients, '091••••4567, 091••••4321');
      assert.ok(row.alertId, 'linked to the in-app alert');

      const alerts = AlertsSchema.parse(await (await fetch(`${t.base}/api/alerts`)).json());
      const breach = alerts.items.find((a) => a.type === 'above_max');
      assert.equal(breach?.sms?.status, 'sent');
    });

    it('a second crossing within the cooldown → skipped_cooldown, and no send call', async () => {
      const rec = recordingProvider();
      t = await startTestServer({ provider: rec.provider });
      await postReading(t.base, hot); // HIGH → sent
      await postReading(t.base, normal); // back to normal → sent
      await postReading(t.base, hot); // HIGH again within 30 min → skipped
      await t.settle();

      assert.equal(rec.calls.length, 2);
      assert.match(rec.calls[1]?.text ?? '', /^\[Greenhouse\] Air temp back to normal: 27.4C at /);
      assert.deepEqual(
        (await smsRows()).map((r) => `${r.condition}:${r.status}`),
        ['HIGH:sent', 'NORMAL:sent', 'HIGH:skipped_cooldown'],
      );
    });

    it('a crossing after the cooldown sends again', async () => {
      let now = Date.now();
      const rec = recordingProvider();
      t = await startTestServer({ provider: rec.provider, clock: () => now });
      await postReading(t.base, hot);
      await postReading(t.base, normal);
      await t.settle();
      now += 31 * MIN;
      await postReading(t.base, hot);
      await t.settle();

      assert.equal(rec.calls.length, 3);
      assert.deepEqual(
        (await smsRows()).map((r) => `${r.condition}:${r.status}`),
        ['HIGH:sent', 'NORMAL:sent', 'HIGH:sent'],
      );
    });

    it('a provider timeout → the SMS is saved as failed, and the reading request still succeeds', async () => {
      // The real Semaphore provider against a server that never answers (10 s → 50 ms here).
      let requests = 0;
      const provider = createSemaphoreProvider({
        apiKey: 'test-key',
        timeoutMs: 50,
        retryDelayMs: 0,
        fetchFn: (_url: string | URL | Request, init?: RequestInit) => {
          requests++;
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          });
        },
      });
      t = await startTestServer({ provider });
      const res = await postReading(t.base, hot);
      assert.equal(res.status, 201, 'ingest never waits for or fails on the SMS');
      assert.equal(await prisma.reading.count(), 1);
      await t.settle();

      assert.equal(requests, 2, 'one retry');
      const [row] = await smsRows();
      assert.equal(row?.status, 'failed');
      assert.match(row.providerResponse ?? '', /no answer within/);
      const alerts = AlertsSchema.parse(await (await fetch(`${t.base}/api/alerts`)).json());
      assert.equal(alerts.items.find((a) => a.type === 'above_max')?.sms?.status, 'failed');
    });

    it('a provider error is saved as failed too', async () => {
      const rec = recordingProvider(() => ({
        ok: false,
        providerResponse: 'HTTP 401: bad key',
        attempts: 1,
      }));
      t = await startTestServer({ provider: rec.provider });
      assert.equal((await postReading(t.base, hot)).status, 201);
      await t.settle();
      const [row] = await smsRows();
      assert.equal(row?.status, 'failed');
      assert.equal(row.providerResponse, 'HTTP 401: bad key');
    });

    it('dry run never calls the provider; attempts are saved as dry_run', async () => {
      const rec = recordingProvider();
      t = await startTestServer({ provider: rec.provider, dryRun: true });
      await postReading(t.base, hot);
      await t.settle();
      const test = await fetch(`${t.base}/api/alerts/test`, {
        method: 'POST',
        headers: { 'X-Admin-Key': TEST_ADMIN_KEY },
      });
      assert.equal(test.status, 200);
      assert.equal(
        z
          .object({ status: z.string(), dryRun: z.boolean() })
          .loose()
          .parse(await test.json()).dryRun,
        true,
      );
      assert.equal(rec.calls.length, 0, 'provider never called');
      assert.deepEqual(
        (await smsRows()).map((r) => r.status),
        ['dry_run', 'dry_run'],
      );
    });

    it('POST /api/alerts/test with X-Admin-Key sends one SMS to every number', async () => {
      const rec = recordingProvider();
      t = await startTestServer({ provider: rec.provider });
      const res = await fetch(`${t.base}/api/alerts/test`, {
        method: 'POST',
        headers: { 'X-Admin-Key': TEST_ADMIN_KEY },
      });
      assert.equal(res.status, 200);
      const body = z
        .object({
          status: z.literal('sent'),
          dryRun: z.literal(false),
          recipients: z.array(z.string()),
        })
        .loose()
        .parse(await res.json());
      assert.deepEqual(body.recipients, ['091••••4567', '091••••4321']);
      assert.equal(rec.calls.length, 1);
      assert.deepEqual(rec.calls[0]?.recipients, TEST_NUMBERS);
      assert.match(rec.calls[0].text, /^\[Greenhouse\] Test message: SMS alerts are working/);

      const status = z
        .object({
          dryRun: z.boolean(),
          recipients: z.array(z.string()),
          recent: z.array(z.unknown()),
        })
        .loose()
        .parse(await (await fetch(`${t.base}/api/sms/status`)).json());
      assert.deepEqual(status.recipients, ['091••••4567', '091••••4321'], 'never the full numbers');
      assert.equal(status.recent.length, 1);
    });
  },
);
