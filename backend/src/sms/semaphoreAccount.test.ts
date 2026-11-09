import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkSemaphoreAccount } from './semaphoreAccount.js';

const KEY = 'sk_live_SECRET123';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Routes by path: /account and /account/sendernames. */
function fakeApi(account: () => Response, senders: () => Response) {
  const urls: string[] = [];
  const fetchFn = ((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    return Promise.resolve(url.includes('/account/sendernames') ? senders() : account());
  }) as typeof fetch;
  return { fetchFn, urls };
}

const text = (r: { lines: { text: string }[] }) => r.lines.map((l) => l.text).join('\n');

describe('checkSemaphoreAccount', () => {
  it('a good account: key accepted, credit shown, sender name registered', async () => {
    const { fetchFn, urls } = fakeApi(
      () =>
        json({
          account_id: 1,
          account_name: 'Rio Greenhouse',
          status: 'Active',
          credit_balance: 250,
        }),
      () => json([{ name: 'ETANIM', status: 'Active', created_at: '2026-11-01' }]),
    );
    const r = await checkSemaphoreAccount({ apiKey: KEY, senderName: 'etanim', fetchFn });
    assert.equal(r.ok, true);
    assert.equal(r.credit, 250);
    assert.match(text(r), /API key accepted\. Account: Rio Greenhouse \(status: Active\)/);
    assert.match(text(r), /Credit: 250/);
    assert.match(
      text(r),
      /Sender name "etanim" is registered \(status: Active\)/,
      'case-insensitive match',
    );
    // exactly the two documented calls, key as a query parameter
    assert.equal(urls.length, 2);
    assert.ok(urls[0]?.startsWith('https://api.semaphore.co/api/v4/account?apikey='));
    assert.ok(urls[1]?.startsWith('https://api.semaphore.co/api/v4/account/sendernames?apikey='));
  });

  it('credit as a string is understood', async () => {
    const { fetchFn } = fakeApi(
      () => json({ account_name: 'A', credit_balance: '42' }),
      () => json([{ name: 'X' }]),
    );
    assert.equal((await checkSemaphoreAccount({ apiKey: KEY, fetchFn })).credit, 42);
  });

  it('no credit is an error, low credit a warning', async () => {
    const none = fakeApi(
      () => json({ account_name: 'A', credit_balance: 0 }),
      () => json([{ name: 'X' }]),
    );
    const r0 = await checkSemaphoreAccount({ apiKey: KEY, fetchFn: none.fetchFn });
    assert.equal(r0.ok, false);
    assert.match(text(r0), /No credit left/);

    const low = fakeApi(
      () => json({ account_name: 'A', credit_balance: 5 }),
      () => json([{ name: 'X' }]),
    );
    const r5 = await checkSemaphoreAccount({ apiKey: KEY, fetchFn: low.fetchFn });
    assert.equal(r5.ok, true, 'low credit still works');
    assert.equal(r5.lines.find((l) => /Only 5/.test(l.text))?.level, 'warn');
  });

  it('a rejected key stops early, with the key redacted', async () => {
    const { fetchFn, urls } = fakeApi(
      () => json({ message: `Invalid apikey ${KEY}` }, 401),
      () => json([]),
    );
    const r = await checkSemaphoreAccount({ apiKey: KEY, fetchFn });
    assert.equal(r.ok, false);
    assert.match(text(r), /did not accept the API key \(HTTP 401\)/);
    assert.ok(!text(r).includes(KEY), 'the key must never be printed');
    assert.equal(urls.length, 1, 'does not continue to the sender names');
  });

  it('a 200 answer that is not an account is rejected too', async () => {
    const { fetchFn } = fakeApi(
      () => json({ error: 'nope' }),
      () => json([]),
    );
    assert.equal((await checkSemaphoreAccount({ apiKey: KEY, fetchFn })).ok, false);
  });

  it('a sender name that is not registered is an error and lists the real ones', async () => {
    const { fetchFn } = fakeApi(
      () => json({ account_name: 'A', credit_balance: 100 }),
      () => json([{ name: 'REAL', status: 'Active' }]),
    );
    const r = await checkSemaphoreAccount({ apiKey: KEY, senderName: 'WRONG', fetchFn });
    assert.equal(r.ok, false);
    assert.match(text(r), /"WRONG" is not one of your sender names \(REAL \[Active\]\)/);
  });

  it('no sender name registered at all is a warning (sending will be rejected)', async () => {
    const { fetchFn } = fakeApi(
      () => json({ account_name: 'A', credit_balance: 100 }),
      () => json([]),
    );
    const r = await checkSemaphoreAccount({ apiKey: KEY, fetchFn });
    assert.equal(r.ok, true);
    assert.equal(r.lines.find((l) => /No sender name/.test(l.text))?.level, 'warn');
  });

  it('an unreadable sender-name answer is only a warning', async () => {
    const { fetchFn } = fakeApi(
      () => json({ account_name: 'A', credit_balance: 100 }),
      () => new Response('oops', { status: 500 }),
    );
    const r = await checkSemaphoreAccount({ apiKey: KEY, fetchFn });
    assert.equal(r.ok, true);
    assert.match(text(r), /Could not read the sender names \(HTTP 500\)/);
  });

  it('no internet is explained', async () => {
    const fetchFn = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    const r = await checkSemaphoreAccount({ apiKey: KEY, fetchFn });
    assert.equal(r.ok, false);
    assert.match(text(r), /Could not reach Semaphore/);
  });
});
