import { z } from 'zod';
import { maskPhonesInText, toE164 } from './phone.js';
import type { SmsProvider, SmsSendResult } from './provider.js';

/**
 * textbee (textbee.dev): an Android phone with the textbee app sends the SMS from
 * its own SIM. Documented in textbee.dev/docs ("Sending SMS", "API reference"):
 * POST /api/v1/gateway/send-sms, header x-api-key, JSON body { recipients, message,
 * deviceId?, simSlotIndex? }. A 200 means "queued on the phone", not delivered.
 */
export const TEXTBEE_BASE = 'https://api.textbee.dev/api/v1';
export const TEXTBEE_SEND_URL = `${TEXTBEE_BASE}/gateway/send-sms`;
/** Generic client name (textbee's Cloudflare blocks some default user agents). */
export const TEXTBEE_USER_AGENT = 'greenhouse-backend';
const TIMEOUT_MS = 10_000;
const RESPONSE_MAX_CHARS = 500;

/** Documented success: { data: { success, message, smsBatchId, recipientCount, … } }. */
const SendAnswerSchema = z.object({
  data: z.object({
    success: z.boolean().optional(),
    message: z.string().optional(),
    smsBatchId: z.string().optional(),
    recipientCount: z.number().optional(),
    /** Instead of the queue fields when the message was dispatched at once. */
    successCount: z.number().optional(),
    failureCount: z.number().optional(),
    /** Single sends only, e.g. { code: "SMS_PERMISSION_MISSING" }. */
    warning: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
  }),
});

/** Error bodies: "error" (most 400s, 401), "message" (429; some 400s), "code" (401). */
const ErrorAnswerSchema = z.object({
  error: z.string().optional(),
  message: z.union([z.string(), z.array(z.string())]).optional(),
  code: z.string().optional(),
});

/** A plain-language hint per documented status code (textbee.dev/docs, "Sending SMS"). */
const HINTS: Record<number, string> = {
  400: 'check that the textbee email is verified and the phone is enabled',
  401: 'TEXTBEE_API_KEY is wrong or was revoked',
  403: 'textbee blocked this account or request',
  404: 'TEXTBEE_DEVICE_ID is not a phone on this textbee account',
  429: 'the textbee plan limit (per day or month) is used up',
};

interface TextbeeOptions {
  apiKey: string;
  /** The phone to send from; omitted = the account's default phone. */
  deviceId?: string | undefined;
  /** 0 = SIM 1, 1 = SIM 2; omitted = the phone's default SIM. */
  simSlot?: number | undefined;
  timeoutMs?: number;
  /** Wait before the one retry. */
  retryDelayMs?: number;
  /** Injected in tests. */
  fetchFn?: typeof fetch;
}

type Attempt = { retry: boolean; result: Omit<SmsSendResult, 'attempts'> };

function explainError(status: number, raw: string): string {
  let detail = raw;
  try {
    const parsed = ErrorAnswerSchema.safeParse(JSON.parse(raw) as unknown);
    if (parsed.success) {
      const { error, message, code } = parsed.data;
      const text = [error, Array.isArray(message) ? message.join('; ') : message]
        .filter(Boolean)
        .join(': ');
      if (text) detail = code ? `${text} (${code})` : text;
    }
  } catch {
    /* not JSON: keep the raw text */
  }
  const hint = HINTS[status];
  return `HTTP ${status}: ${detail}${hint ? ` (${hint})` : ''}`;
}

/**
 * All recipients in one request (E.164, "+639…"). Timeout 10 s; ONE retry after a
 * network error, a timeout or an HTTP 5xx. A 4xx (wrong key, unknown phone, plan
 * limit) is not retried. Same retry caveat as Semaphore: if textbee had accepted
 * the first request, the SMS can arrive twice.
 */
export function createTextbeeProvider(opts: TextbeeOptions): SmsProvider {
  const {
    apiKey,
    deviceId,
    simSlot,
    timeoutMs = TIMEOUT_MS,
    retryDelayMs = 1_000,
    fetchFn = fetch,
  } = opts;

  /** No API key, no full phone numbers, bounded length. */
  const clean = (text: string) =>
    maskPhonesInText(text.split(apiKey).join('***')).slice(0, RESPONSE_MAX_CHARS);

  async function attempt(body: string): Promise<Attempt> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    let res: Response;
    let raw: string;
    try {
      res = await fetchFn(TEXTBEE_SEND_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'User-Agent': TEXTBEE_USER_AGENT,
        },
        body,
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

    if (!res.ok) {
      return {
        retry: res.status >= 500,
        result: { ok: false, providerResponse: clean(explainError(res.status, raw)) },
      };
    }

    let json: unknown;
    try {
      json = JSON.parse(raw) as unknown;
    } catch {
      return {
        retry: false,
        result: { ok: false, providerResponse: clean(`unreadable answer: ${raw}`) },
      };
    }
    const answer = SendAnswerSchema.safeParse(json);
    if (!answer.success) {
      return { retry: false, result: { ok: false, providerResponse: clean(`rejected: ${raw}`) } };
    }
    const d = answer.data.data;
    const accepted = d.success === true || (d.success === undefined && (d.successCount ?? 0) > 0);
    const parts = [
      accepted ? 'queued on the phone' : `not accepted: ${d.message ?? raw}`,
      d.smsBatchId ? `batch ${d.smsBatchId}` : null,
      d.recipientCount !== undefined ? `${d.recipientCount} recipient(s)` : null,
      d.failureCount ? `${d.failureCount} failed` : null,
      d.warning ? `warning: ${d.warning.code ?? ''} ${d.warning.message ?? ''}`.trim() : null,
    ];
    return {
      retry: false,
      result: { ok: accepted, providerResponse: clean(parts.filter(Boolean).join('; ')) },
    };
  }

  return {
    name: 'textbee',
    async send(recipients, text) {
      if (recipients.length === 0) {
        return { ok: false, providerResponse: 'no recipients', attempts: 0 };
      }
      const body = JSON.stringify({
        recipients: recipients.map(toE164),
        message: text,
        ...(deviceId ? { deviceId } : {}),
        ...(simSlot !== undefined ? { simSlotIndex: simSlot } : {}),
      });

      const first = await attempt(body);
      if (!first.retry) return { ...first.result, attempts: 1 };
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      const second = await attempt(body);
      return {
        ...second.result,
        providerResponse: clean(
          `retried after "${first.result.providerResponse}"; ${second.result.providerResponse}`,
        ),
        attempts: 2,
      };
    },
  };
}
