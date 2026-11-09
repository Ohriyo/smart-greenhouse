import { z } from 'zod';

const BASE = 'https://api.semaphore.co/api/v4';

/** Documented account fields (docs: "account_name", "status", "credit_balance"). Extra fields are ignored. */
const AccountSchema = z.object({
  account_name: z.string().optional(),
  status: z.string().optional(),
  credit_balance: z.union([z.number(), z.string()]).optional(),
});

/** Documented sender-name fields: "name", "status". */
const SenderNamesSchema = z.array(z.object({ name: z.string(), status: z.string().optional() }));

export interface SemaphoreCheck {
  ok: boolean;
  /** Plain-language lines for the owner: what works, what to fix. */
  lines: { level: 'ok' | 'warn' | 'error'; text: string }[];
  /** Credits left (one credit = one SMS), when the account answered. */
  credit: number | null;
}

interface Options {
  apiKey: string;
  /** The SEMAPHORE_SENDER_NAME from .env, if any. */
  senderName?: string | undefined;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Read-only setup check: is the API key accepted, how much credit is left, is a
 * sender name registered. Sends NO SMS and costs nothing. Semaphore limits these two
 * endpoints to 2 calls per minute, and this makes exactly 2.
 */
export async function checkSemaphoreAccount(opts: Options): Promise<SemaphoreCheck> {
  const { apiKey, senderName, fetchFn = fetch, timeoutMs = 10_000 } = opts;
  const lines: SemaphoreCheck['lines'] = [];
  const redact = (text: string) => text.split(apiKey).join('***').slice(0, 200);

  async function get(path: string): Promise<{ status: number; body: unknown; raw: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const res = await fetchFn(
        `${BASE}${path}?${new URLSearchParams({ apikey: apiKey }).toString()}`,
        {
          signal: controller.signal,
        },
      );
      const raw = await res.text();
      let body: unknown = null;
      try {
        body = JSON.parse(raw) as unknown;
      } catch {
        /* not JSON: handled by the callers */
      }
      return { status: res.status, body, raw };
    } finally {
      clearTimeout(timer);
    }
  }

  // 1. Account: proves the key works and shows the credit.
  let credit: number | null = null;
  try {
    const res = await get('/account');
    const parsed = AccountSchema.safeParse(res.body);
    if (
      res.status < 200 ||
      res.status >= 300 ||
      !parsed.success ||
      parsed.data.credit_balance === undefined
    ) {
      lines.push({
        level: 'error',
        text: `Semaphore did not accept the API key (HTTP ${res.status}): ${redact(res.raw)}. Check SEMAPHORE_API_KEY.`,
      });
      return { ok: false, lines, credit };
    }
    const account = parsed.data;
    credit = Number(account.credit_balance);
    lines.push({
      level: 'ok',
      text: `API key accepted. Account: ${account.account_name ?? 'unnamed'}${account.status ? ` (status: ${account.status})` : ''}.`,
    });
    if (!Number.isFinite(credit)) {
      credit = null;
    } else if (credit <= 0) {
      lines.push({
        level: 'error',
        text: 'No credit left: every SMS will fail. Add credit in your Semaphore account.',
      });
    } else if (credit < 20) {
      lines.push({
        level: 'warn',
        text: `Only ${credit} credit(s) left (one credit = one SMS). Consider adding more.`,
      });
    } else {
      lines.push({ level: 'ok', text: `Credit: ${credit} (one credit = one SMS).` });
    }
  } catch {
    lines.push({
      level: 'error',
      text: 'Could not reach Semaphore (check the laptop’s internet connection).',
    });
    return { ok: false, lines, credit };
  }

  // 2. Sender names: Semaphore sends from a registered sender name.
  try {
    const res = await get('/account/sendernames');
    const parsed = SenderNamesSchema.safeParse(res.body);
    if (res.status < 200 || res.status >= 300 || !parsed.success) {
      lines.push({
        level: 'warn',
        text: `Could not read the sender names (HTTP ${res.status}). Sending may still work with your account’s default.`,
      });
    } else {
      const names = parsed.data;
      const list = names.map((n) => `${n.name}${n.status ? ` [${n.status}]` : ''}`).join(', ');
      if (names.length === 0) {
        lines.push({
          level: 'warn',
          text: 'No sender name is registered. Semaphore rejects messages without one: register one in your Semaphore account.',
        });
      } else if (senderName) {
        const match = names.find((n) => n.name.toLowerCase() === senderName.toLowerCase());
        lines.push(
          match
            ? {
                level: 'ok',
                text: `Sender name "${senderName}" is registered${match.status ? ` (status: ${match.status})` : ''}.`,
              }
            : {
                level: 'error',
                text: `SEMAPHORE_SENDER_NAME "${senderName}" is not one of your sender names (${list}). Fix .env or register it.`,
              },
        );
      } else {
        lines.push({
          level: 'ok',
          text: `Registered sender names: ${list}. (SEMAPHORE_SENDER_NAME is empty: your account default is used.)`,
        });
      }
    }
  } catch {
    lines.push({
      level: 'warn',
      text: 'Could not read the sender names (no answer from Semaphore).',
    });
  }

  return { ok: !lines.some((l) => l.level === 'error'), lines, credit };
}
