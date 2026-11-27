import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSemaphoreProvider, createSmsProvider, SEMAPHORE_URL } from './provider.js';

const KEY = 'sk_live_SECRET123';
const TO = ['09171234567', '09187654321'];

interface Captured {
  url: string;
  method: string | undefined;
  contentType: string | undefined;
  form: URLSearchParams;
}

/** A fetch that answers with the next scripted reply (Response, or an error to throw). */
function scriptedFetch(...replies: (() => Response | Promise<Response>)[]) {
  const calls: Captured[] = [];
  const fetchFn = ((input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      method: init?.method,
      contentType: headers.get('content-type') ?? undefined,
      form: new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : undefined),
    });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (!reply) throw new Error('no scripted reply');
    // A reply that never resolves until aborted (timeout tests).
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
const queued = () =>
  json([
    { message_id: 1, recipient: '639171234567', status: 'Queued' },
    { message_id: 2, recipient: '639187654321', status: 'Queued' },
  ]);
const never = () => new Promise<Response>(() => undefined);

function provider(fetchFn: typeof fetch, senderName?: string) {
  return createSemaphoreProvider({
    apiKey: KEY,
    senderName,
    fetchFn,
    timeoutMs: 50,
    retryDelayMs: 0,
  });
}

describe('Semaphore provider: request', () => {
  it('posts one form-encoded request with all recipients, comma-separated', async () => {
    const { fetchFn, calls } = scriptedFetch(queued);
    const result = await provider(fetchFn, 'ETANIM').send(TO, '[Greenhouse] hello');

    assert.equal(result.ok, true);
    assert.equal(result.attempts, 1);
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.ok(call);
    assert.equal(call.url, SEMAPHORE_URL);
    assert.equal(call.url, 'https://api.semaphore.co/api/v4/messages');
    assert.equal(call.method, 'POST');
    assert.equal(call.contentType, 'application/x-www-form-urlencoded');
    assert.equal(call.form.get('apikey'), KEY);
    assert.equal(call.form.get('number'), '09171234567,09187654321');
    assert.equal(call.form.get('message'), '[Greenhouse] hello');
    assert.equal(call.form.get('sendername'), 'ETANIM');
  });

  it('omits sendername when none is configured (the account default is used)', async () => {
    const { fetchFn, calls } = scriptedFetch(queued);
    await provider(fetchFn).send(TO, 'x');
    assert.equal(calls[0]?.form.has('sendername'), false);
  });

  it('refuses text that starts with "TEST" (Semaphore silently drops it)', async () => {
    const { fetchFn, calls } = scriptedFetch(queued);
    const result = await provider(fetchFn).send(TO, 'Test: hello');
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  });
});

describe('Semaphore provider: answers, timeout and retry', () => {
  it('never puts the API key in the result, and masks numbers', async () => {
    const { fetchFn } = scriptedFetch(queued);
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(result.providerResponse.includes('639171234567'), false);
    assert.match(result.providerResponse, /"recipient":"639•••••4567"/);

    const echo = scriptedFetch(() => json({ error: `invalid apikey ${KEY}` }));
    const rejected = await provider(echo.fetchFn).send(TO, 'x');
    assert.equal(rejected.providerResponse.includes(KEY), false);
    assert.match(rejected.providerResponse, /\*\*\*/);
  });

  it('a 4xx is final: no retry', async () => {
    const { fetchFn, calls } = scriptedFetch(() => json({ message: 'Unauthorized' }, 401));
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(result.ok, false);
    assert.equal(calls.length, 1);
    assert.match(result.providerResponse, /HTTP 401/);
  });

  it('a non-record answer (e.g. wrong key, no sender name) is final: no retry', async () => {
    const { fetchFn, calls } = scriptedFetch(() => json({ sendername: ['invalid'] }));
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(result.ok, false);
    assert.equal(calls.length, 1);
  });

  it('a 5xx is retried once and can then succeed', async () => {
    const { fetchFn, calls } = scriptedFetch(() => json({}, 503), queued);
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
    assert.equal(calls.length, 2);
    assert.match(result.providerResponse, /retried after "HTTP 503/);
  });

  it('a network error is retried once, then reported as failed', async () => {
    const { fetchFn, calls } = scriptedFetch(() => {
      throw new TypeError('fetch failed');
    });
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(result.ok, false);
    assert.equal(result.attempts, 2);
    assert.equal(calls.length, 2);
    assert.match(result.providerResponse, /network error/);
  });

  it('a timeout is retried once, then reported as failed', async () => {
    const { fetchFn, calls } = scriptedFetch(never);
    const result = await provider(fetchFn).send(TO, 'x');
    assert.equal(result.ok, false);
    assert.equal(calls.length, 2);
    assert.match(result.providerResponse, /no answer within/);
  });

  it('messages the network rejected count as failed; one accepted recipient is enough', async () => {
    const failed = scriptedFetch(() => json([{ message_id: 1, status: 'Failed' }]));
    assert.equal((await provider(failed.fetchFn).send(TO, 'x')).ok, false);
    const mixed = scriptedFetch(() =>
      json([
        { message_id: 1, status: 'Refunded' },
        { message_id: 2, status: 'Pending' },
      ]),
    );
    assert.equal((await provider(mixed.fetchFn).send(TO, 'x')).ok, true);
  });
});

describe('createSmsProvider', () => {
  it('builds the provider SMS_PROVIDER names, and needs its API key', () => {
    assert.equal(createSmsProvider({ SMS_PROVIDER: 'semaphore' }), null);
    assert.equal(
      createSmsProvider({ SMS_PROVIDER: 'semaphore', SEMAPHORE_API_KEY: KEY })?.name,
      'semaphore',
    );
    assert.equal(createSmsProvider({ SMS_PROVIDER: 'textbee', SEMAPHORE_API_KEY: KEY }), null);
    assert.equal(
      createSmsProvider({ SMS_PROVIDER: 'textbee', TEXTBEE_API_KEY: KEY })?.name,
      'textbee',
    );
  });
});
