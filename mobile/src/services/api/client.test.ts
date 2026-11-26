// API client tests (Node's test runner via tsx: `npm test`). The modules are
// loaded in before(), after EXPO_PUBLIC_API_URL is set exactly as a build sets it
// (static imports would run first).
import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';
import { z } from 'zod';

type Config = typeof import('@/constants/config');
type Client = typeof import('./client');
type Errors = typeof import('./errors');
let parseApiUrl: Config['parseApiUrl'];
let apiRequest: Client['apiRequest'];
let E: Errors;

before(async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://greenhouse-api.example.com/';
  ({ parseApiUrl } = await import('@/constants/config'));
  ({ apiRequest } = await import('./client'));
  E = await import('./errors');
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replaces fetch; records the requested URLs. */
function mockFetch(answer: (url: string, init?: RequestInit) => Promise<Response>) {
  const urls: string[] = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    urls.push(url);
    return answer(url, init);
  };
  return urls;
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

const OkSchema = z.object({ status: z.literal('ok') });

/** Asserts `err` is an instance of `cls` and returns it with that type. */
function expectInstance<T>(err: unknown, cls: abstract new (...args: never[]) => T): T {
  assert.ok(err instanceof cls, `expected ${cls.name}, got ${String(err)}`);
  return err;
}

describe('base URL (EXPO_PUBLIC_API_URL)', () => {
  it('requests go to the URL from the build, without a double slash', async () => {
    const urls = mockFetch(() => json({ status: 'ok' }));
    assert.deepEqual(await apiRequest('/api/health', OkSchema), { status: 'ok' });
    assert.deepEqual(urls, ['https://greenhouse-api.example.com/api/health']);
  });

  it('parseApiUrl accepts http(s) URLs and rejects missing or invalid values', () => {
    assert.equal(parseApiUrl(' https://x.onrender.com// '), 'https://x.onrender.com');
    assert.equal(parseApiUrl('http://192.168.1.50:4000'), 'http://192.168.1.50:4000');
    assert.equal(parseApiUrl(undefined), null);
    assert.equal(parseApiUrl(''), null);
    assert.equal(parseApiUrl('greenhouse-api.example.com'), null);
    assert.equal(parseApiUrl('ftp://example.com'), null);
  });
});

describe('errors', () => {
  it('a server that never answers → TimeoutError, with a "Retry" hint', async () => {
    mockFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const err = await apiRequest('/api/health', OkSchema, { timeoutMs: 50 }).catch(
      (e: unknown) => e,
    );
    assert.ok(err instanceof E.TimeoutError);
    assert.match(E.describeError(err), /Retry/);
  });

  it('no connection → NetworkError', async () => {
    mockFetch(() => Promise.reject(new TypeError('Network request failed')));
    const err = await apiRequest('/api/health', OkSchema).catch((e: unknown) => e);
    assert.ok(err instanceof E.NetworkError);
  });

  it('an error response → HttpError with the backend code, message and details', async () => {
    mockFetch(() =>
      json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request',
            details: [{ path: 'airTempMin', message: 'airTempMin must be lower than airTempMax' }],
          },
        },
        400,
      ),
    );
    const err = await apiRequest('/api/thresholds', OkSchema, { method: 'PUT', body: {} }).catch(
      (e: unknown) => e,
    );
    const http = expectInstance(err, E.HttpError);
    assert.equal(http.status, 400);
    assert.equal(http.code, 'VALIDATION_ERROR');
    assert.equal(http.details[0]?.path, 'airTempMin');
    assert.match(E.describeError(err), /airTempMin must be lower/);
  });

  it('a response that does not match the contract → ValidationError', async () => {
    mockFetch(() => json({ status: 'surprise' }));
    const err = await apiRequest('/api/health', OkSchema).catch((e: unknown) => e);
    assert.ok(err instanceof E.ValidationError);
  });

  it('a caller abort is passed through as-is (TanStack Query ignores it)', async () => {
    mockFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const caller = new AbortController();
    const pending = apiRequest('/api/health', OkSchema, { signal: caller.signal });
    caller.abort();
    const err = await pending.catch((e: unknown) => e);
    assert.equal(expectInstance(err, DOMException).name, 'AbortError');
  });
});
