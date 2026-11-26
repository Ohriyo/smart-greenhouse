import { z } from 'zod';
import { maskPhonesInText } from './phone.js';

/** Result of one send (after the retry, if any). Never contains the API key. */
export interface SmsSendResult {
  /** true when the provider accepted the message for at least one recipient. */
  ok: boolean;
  /** Short answer or error for the log table (key removed, numbers masked, ≤ 500 chars). */
  providerResponse: string;
  /** HTTP requests made: 1, or 2 after a retry. */
  attempts: number;
}

/** Something that can send one SMS to several numbers. Add a provider by implementing this. */
export interface SmsProvider {
  readonly name: 'semaphore';
  /** Never throws: failures come back as `ok: false`. */
  send(recipients: readonly string[], text: string): Promise<SmsSendResult>;
}

/** Documented in semaphore.co/docs ("Sending Messages"). */
export const SEMAPHORE_URL = 'https://api.semaphore.co/api/v4/messages';
export const SMS_TIMEOUT_MS = 10_000;
const RESPONSE_MAX_CHARS = 500;

/**
 * Documented response: one record per recipient, `status` Queued | Pending | Sent |
 * Failed | Refunded. Other fields are ignored. The error format is NOT documented,
 * so anything that isn't a list of records counts as a rejection.
 */
const SemaphoreRecordsSchema = z
  .array(
    z.object({
      message_id: z.union([z.number(), z.string()]),
      recipient: z.union([z.number(), z.string()]).optional(),
      status: z.string(),
    }),
  )
  .min(1);

interface SemaphoreOptions {
  apiKey: string;
  /** Registered sender name; omitted = the account's default. */
  senderName?: string | undefined;
  timeoutMs?: number;
  /** Wait before the one retry. */
  retryDelayMs?: number;
  /** Injected in tests. */
  fetchFn?: typeof fetch;
}

type Attempt =
  | { retry: false; result: Omit<SmsSendResult, 'attempts'> }
  | { retry: true; result: Omit<SmsSendResult, 'attempts'> };

/**
 * Semaphore (semaphore.co, Philippines): form-encoded POST /api/v4/messages with
 * all recipients in one request ("number=09…,09…", up to 1000 per call).
 * Timeout 10 s; ONE retry after a network error, a timeout or an HTTP 5xx.
 * A 4xx or a rejected message is not retried.
 *
 * Retry caveat: if the first request timed out after Semaphore had already
 * accepted it, the retry can deliver the SMS twice. Accepted trade-off for alerts.
 */
export function createSemaphoreProvider(opts: SemaphoreOptions): SmsProvider {
  const {
    apiKey,
    senderName,
    timeoutMs = SMS_TIMEOUT_MS,
    retryDelayMs = 1_000,
    fetchFn = fetch,
  } = opts;

  /** No API key, no full phone numbers, bounded length. */
  const clean = (text: string) =>
    maskPhonesInText(text.split(apiKey).join('***')).slice(0, RESPONSE_MAX_CHARS);

  async function attempt(form: URLSearchParams): Promise<Attempt> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    let res: Response;
    let raw: string;
    try {
      res = await fetchFn(SEMAPHORE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: controller.signal,
      });
      raw = await res.text();
    } catch (err) {
      const why = controller.signal.aborted
        ? `no answer within ${Math.round(timeoutMs / 1000)} s`
        : `network error: ${err instanceof Error ? err.message : String(err)}`;
      return { retry: true, result: { ok: false, providerResponse: clean(why) } };
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 500) {
      return { retry: true, result: { ok: false, providerResponse: clean(`HTTP ${res.status}: ${raw}`) } };
    }
    if (!res.ok) {
      return { retry: false, result: { ok: false, providerResponse: clean(`HTTP ${res.status}: ${raw}`) } };
    }

    let json: unknown;
    try {
      json = JSON.parse(raw) as unknown;
    } catch {
      return { retry: false, result: { ok: false, providerResponse: clean(`unreadable answer: ${raw}`) } };
    }
    const records = SemaphoreRecordsSchema.safeParse(json);
    // Errors such as a wrong key or an unregistered sender name come back as a non-record body.
    if (!records.success) {
      return { retry: false, result: { ok: false, providerResponse: clean(`rejected: ${raw}`) } };
    }
    const accepted = records.data.some((r) => !/^(failed|refunded)$/i.test(r.status));
    const summary = JSON.stringify(
      records.data.map((r) => ({ message_id: r.message_id, recipient: r.recipient, status: r.status })),
    );
    return { retry: false, result: { ok: accepted, providerResponse: clean(summary) } };
  }

  return {
    name: 'semaphore',
    async send(recipients, text) {
      // Semaphore silently drops messages that start with "TEST" (their docs).
      if (/^\s*test/i.test(text)) {
        return {
          ok: false,
          providerResponse: 'not sent: Semaphore silently ignores messages that start with "TEST"',
          attempts: 0,
        };
      }
      const form = new URLSearchParams({ apikey: apiKey, number: recipients.join(','), message: text });
      if (senderName) form.set('sendername', senderName);

      const first = await attempt(form);
      if (!first.retry) return { ...first.result, attempts: 1 };
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      const second = await attempt(form);
      return {
        ...second.result,
        providerResponse: clean(`retried after "${first.result.providerResponse}"; ${second.result.providerResponse}`),
        attempts: 2,
      };
    },
  };
}

export function createSmsProvider(config: {
  SEMAPHORE_API_KEY?: string | undefined;
  SEMAPHORE_SENDER_NAME?: string | undefined;
}): SmsProvider | null {
  if (!config.SEMAPHORE_API_KEY) return null;
  return createSemaphoreProvider({
    apiKey: config.SEMAPHORE_API_KEY,
    senderName: config.SEMAPHORE_SENDER_NAME,
  });
}
