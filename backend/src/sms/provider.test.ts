import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createConsoleProvider,
  createSemaphoreProvider,
  createSmsProvider,
  maskPhone,
} from './provider.js';

const KEY = 'sk_live_SECRET123';

interface Captured {
  url: string;
  method: string | undefined;
  contentType: string | undefined;
  form: URLSearchParams;
}

/** A fetch that answers with `reply` and records the request. */
function fakeFetch(reply: () => Response | Promise<Response>) {
  const calls: Captured[] = [];
  const fetchFn = ((input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      method: init?.method,
      contentType: headers.get('content-type') ?? undefined,
      form: new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : undefined),
    });
    return Promise.resolve(reply());
  }) as typeof fetch;
  return { fetchFn, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Semaphore provider', () => {
  it('posts a form-encoded message and returns the message id', async () => {
    const { fetchFn, calls } = fakeFetch(() => json([{ message_id: 12345, status: 'Queued' }]));
    const p = createSemaphoreProvider({ apiKey: KEY, senderName: 'ETANIM', fetchFn });
    const result = await p.send('+639171234567', 'ETanim test: SMS alerts are working.');

    assert.deepEqual(result, { id: '12345' });
    const call = calls[0];
    assert.ok(call);
    assert.equal(call.url, 'https://api.semaphore.co/api/v4/messages');
    assert.equal(call.method, 'POST');
    assert.equal(call.contentType, 'application/x-www-form-urlencoded');
    assert.equal(call.form.get('apikey'), KEY);
    assert.equal(call.form.get('number'), '639171234567', 'the "+" is dropped');
    assert.equal(call.form.get('message'), 'ETanim test: SMS alerts are working.');
    assert.equal(call.form.get('sendername'), 'ETANIM');
  });

  it('omits sendername when none is configured (the account default is used)', async () => {
    const { fetchFn, calls } = fakeFetch(() => json([{ message_id: '1', status: 'Pending' }]));
    await createSemaphoreProvider({ apiKey: KEY, fetchFn }).send('+639171234567', 'x');
    assert.equal(calls[0]?.form.has('sendername'), false);
  });

  it('a "Failed" or "Refunded" record is an error', async () => {
    for (const status of ['Failed', 'Refunded']) {
      const { fetchFn } = fakeFetch(() => json([{ message_id: 7, status }]));
      await assert.rejects(
        createSemaphoreProvider({ apiKey: KEY, fetchFn }).send('+639171234567', 'x'),
        new RegExp(`reports the message as ${status.toLowerCase()}`),
      );
    }
  });

  it('an HTTP error says the status', async () => {
    const { fetchFn } = fakeFetch(() => json({ message: 'Unauthenticated.' }, 401));
    await assert.rejects(
      createSemaphoreProvider({ apiKey: KEY, fetchFn }).send('+639171234567', 'x'),
      /HTTP 401.*Unauthenticated/,
    );
  });

  it('an error body with HTTP 200 (e.g. no sender name) is rejected, not treated as sent', async () => {
    const { fetchFn } = fakeFetch(() =>
      json({ sendername: ['The selected sendername is invalid.'] }),
    );
    await assert.rejects(
      createSemaphoreProvider({ apiKey: KEY, senderName: 'NOPE', fetchFn }).send(
        '+639171234567',
        'x',
      ),
      /rejected the message.*sendername is invalid/,
    );
  });

  it('an unreadable answer is an error', async () => {
    const { fetchFn } = fakeFetch(() => new Response('<html>oops</html>', { status: 200 }));
    await assert.rejects(
      createSemaphoreProvider({ apiKey: KEY, fetchFn }).send('+639171234567', 'x'),
      /unreadable answer/,
    );
  });

  it('no internet gives a plain explanation', async () => {
    const fetchFn = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    await assert.rejects(
      createSemaphoreProvider({ apiKey: KEY, fetchFn }).send('+639171234567', 'x'),
      /Could not reach Semaphore/,
    );
  });

  it('a slow server times out', async () => {
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      })) as unknown as typeof fetch;
    await assert.rejects(
      createSemaphoreProvider({ apiKey: KEY, fetchFn, timeoutMs: 20 }).send('+639171234567', 'x'),
      /Could not reach Semaphore/,
    );
  });

  it('never puts the API key into an error message', async () => {
    const { fetchFn } = fakeFetch(() => json({ error: `invalid key ${KEY}` }, 403));
    await assert.rejects(
      createSemaphoreProvider({ apiKey: KEY, fetchFn }).send('+639171234567', 'x'),
      (err: Error) => {
        assert.ok(!err.message.includes(KEY), err.message);
        assert.match(err.message, /\*\*\*/);
        return true;
      },
    );
  });
});

describe('providers', () => {
  it('test mode sends nothing and says so', async () => {
    const p = createConsoleProvider();
    assert.equal(p.simulated, true);
    assert.deepEqual(await p.send('+639171234567', 'hello'), { id: null });
  });

  it('createSmsProvider picks test mode unless semaphore is fully configured', () => {
    assert.equal(createSmsProvider({ SMS_PROVIDER: 'console' }).name, 'console');
    assert.equal(createSmsProvider({ SMS_PROVIDER: 'semaphore' }).name, 'console');
    assert.equal(
      createSmsProvider({ SMS_PROVIDER: 'semaphore', SEMAPHORE_API_KEY: KEY }).name,
      'semaphore',
    );
  });

  it('masks phone numbers for logs', () => {
    assert.equal(maskPhone('+639171234567'), '+63••••••4567');
    assert.equal(maskPhone('123'), '••••');
  });
});
