import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTextbeeProvider, TEXTBEE_SEND_URL } from './textbee.js';

const KEY = 'tb_SECRET_key_123456';
const DEVICE = '66b1f2c3a4d5e6f7a8b9c0d1';
const TO = ['09171234567', '09187654321'];

interface Captured {
  url: string;
  method: string | undefined;
  headers: Headers;
  body: unknown;
}

/** A fetch that answers with the next scripted reply (Response, or an error to throw). */
function scriptedFetch(...replies: (() => Response | Promise<Response>)[]) {
  const calls: Captured[] = [];
  const fetchFn = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      method: init?.method,
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
    });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (!reply) throw new Error('no scripted reply');
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
      Promise.resolve()
        .then(reply)
        .then(resolve, (err: unknown) => {
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
/** The documented success answer (textbee.dev/docs, "Sending SMS"). */
const queued = () =>
  json({
    data: {
      success: true,
      message: 'SMS added to queue for processing',
      smsBatchId: '66b1f2c3a4d5e6f7a8b9c0d2',
      recipientCount: 2,
    },
  });
const never = () => new Promise<Response>(() => undefined);

function provider(fetchFn: typeof fetch, extra: { deviceId?: string; simSlot?: number } = {}) {
  return createTextbeeProvider({ apiKey: KEY, ...extra, fetchFn, timeoutMs: 50, retryDelayMs: 0 });
}

describe('textbee provider: request', () => {
  it('posts one JSON request with every recipient in E.164, the key in x-api-key', async () => {
    const { fetchFn, calls } = scriptedFetch(queued);
    const result = await provider(fetchFn, { deviceId: DEVICE, simSlot: 1 }).send(
      TO,
      '[Greenhouse] hello',
    );

    assert.equal(result.ok, true);
    assert.equal(result.attempts, 1);
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.ok(call);
    assert.equal(call.url, TEXTBEE_SEND_URL);
    assert.equal(call.method, 'POST');
    assert.equal(call.headers.get('x-api-key'), KEY);
    assert.equal(call.headers.get('content-type'), 'application/json');
    assert.ok(call.headers.get('user-agent'));
    assert.deepEqual(call.body, {
      recipients: ['+639171234567', '+639187654321'],
      message: '[Greenhouse] hello',
      deviceId: DEVICE,
      simSlotIndex: 1,
    });
    assert.match(result.providerResponse, /queued on the phone; batch 66b1f2c3a4d5e6f7a8b9c0d2/);
  });

  it('leaves out deviceId and simSlotIndex when not configured (textbee defaults)', async () => {
    const { fetchFn, calls } = scriptedFetch(queued);
    await provider(fetchFn).send(TO, 'x');
    assert.deepEqual(Object.keys(calls[0]?.body as object).sort(), ['message', 'recipients']);
  });

  it('SIM slot 0 (SIM 1) is sent, not dropped as falsy', async () => {
    const { fetchFn, calls } = scriptedFetch(queued);
    await provider(fetchFn, { simSlot: 0 }).send(TO, 'x');
    assert.equal((calls[0]?.body as { simSlotIndex?: number }).simSlotIndex, 0);
  });
});

describe('textbee provider: answers, timeout and retry', () => {
  it('never puts the API key in the result, and masks numbers', async () => {
    const { fetchFn } = scriptedFetch(() =>
      json({ error: `bad key ${KEY} for +639171234567`, code: 'AUTH_INVALID' }, 401),
    );
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(result.ok, false);
    assert.ok(!result.providerResponse.includes(KEY));
    assert.ok(!result.providerResponse.includes('9171234567'));
  });

  it('a 401 is final and says which setting to check', async () => {
    const { fetchFn, calls } = scriptedFetch(() =>
      json({ error: 'Unauthorized', code: 'AUTH_INVALID' }, 401),
    );
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(calls.length, 1);
    assert.equal(result.attempts, 1);
    assert.match(result.providerResponse, /HTTP 401: Unauthorized \(AUTH_INVALID\)/);
    assert.match(result.providerResponse, /TEXTBEE_API_KEY/);
  });

  it('a 429 (plan limit) is final: no retry', async () => {
    const { fetchFn, calls } = scriptedFetch(() =>
      json({ message: 'Daily limit of 50 messages reached' }, 429),
    );
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(calls.length, 1);
    assert.match(result.providerResponse, /Daily limit of 50 messages reached/);
    assert.match(result.providerResponse, /plan limit/);
  });

  it('a 404 points at TEXTBEE_DEVICE_ID', async () => {
    const { fetchFn } = scriptedFetch(() => json({ error: 'Device not found' }, 404));
    const result = await provider(fetchFn, { deviceId: DEVICE }).send(TO, 'x');
    assert.match(result.providerResponse, /Device not found.*TEXTBEE_DEVICE_ID/);
  });

  it('a 400 without an enabled phone is final', async () => {
    const { fetchFn, calls } = scriptedFetch(() =>
      json(
        {
          success: false,
          error: 'No enabled device found. Enable a device or pass a deviceId.',
        },
        400,
      ),
    );
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(calls.length, 1);
    assert.match(result.providerResponse, /No enabled device found/);
  });

  it('a 5xx is retried once and can then succeed', async () => {
    const { fetchFn, calls } = scriptedFetch(() => new Response('oops', { status: 502 }), queued);
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(calls.length, 2);
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
    assert.match(result.providerResponse, /retried after "HTTP 502: oops"/);
  });

  it('a network error is retried once, then reported as failed', async () => {
    const { fetchFn, calls } = scriptedFetch(() => {
      throw new TypeError('fetch failed');
    });
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(calls.length, 2);
    assert.equal(result.ok, false);
    assert.match(result.providerResponse, /network error: fetch failed/);
  });

  it('a timeout is retried once, then reported as failed', async () => {
    const { fetchFn, calls } = scriptedFetch(never);
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(calls.length, 2);
    assert.equal(result.ok, false);
    assert.match(result.providerResponse, /no answer within/);
  });

  it('success: false in a 200 counts as failed', async () => {
    const { fetchFn } = scriptedFetch(() =>
      json({ data: { success: false, message: 'Failed to send' } }),
    );
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(result.ok, false);
    assert.match(result.providerResponse, /not accepted: Failed to send/);
  });

  it('an immediate dispatch (successCount) counts as sent', async () => {
    const { fetchFn } = scriptedFetch(() => json({ data: { successCount: 2, failureCount: 0 } }));
    assert.equal((await provider(fetchFn).send(TO, 'x')).ok, true);
    const none = scriptedFetch(() => json({ data: { successCount: 0, failureCount: 2 } }));
    assert.equal((await provider(none.fetchFn).send(TO, 'x')).ok, false);
  });

  it('a warning from textbee is recorded with the attempt', async () => {
    const { fetchFn } = scriptedFetch(() =>
      json({
        data: {
          success: true,
          smsBatchId: 'b1',
          warning: { code: 'SMS_PERMISSION_MISSING', message: 'Grant SMS permission' },
        },
      }),
    );
    const result = await provider(fetchFn).send(TO, 'x');
    assert.match(result.providerResponse, /warning: SMS_PERMISSION_MISSING Grant SMS permission/);
  });

  it('an answer that is not the documented shape is a rejection', async () => {
    const { fetchFn } = scriptedFetch(() => json({ status: 'success' }));
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(result.ok, false);
    assert.match(result.providerResponse, /rejected/);
  });
});
