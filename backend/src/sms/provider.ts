import { z } from 'zod';
import { createLogger } from '../lib/logger.js';

const log = createLogger('sms');

/** Something that can send one SMS. Add a provider by implementing this. */
export interface SmsProvider {
  readonly name: 'console' | 'semaphore';
  /** true = nothing leaves this computer (test mode). */
  readonly simulated: boolean;
  /** Resolves when the provider accepted the message; throws with a readable reason otherwise. */
  send(to: string, text: string): Promise<{ id: string | null }>;
}

/** "+63•••••4567": enough to recognise, nothing to leak into logs. */
export function maskPhone(phone: string): string {
  if (phone.length <= 7) return '••••';
  return `${phone.slice(0, 3)}${'•'.repeat(phone.length - 7)}${phone.slice(-4)}`;
}

/** Test mode: the message is only written to the backend log. Costs nothing. */
export function createConsoleProvider(): SmsProvider {
  return {
    name: 'console',
    simulated: true,
    send(to, text) {
      log.info(`[test mode, not sent] SMS to ${maskPhone(to)}: "${text}"`);
      return Promise.resolve({ id: null });
    },
  };
}

const SEMAPHORE_URL = 'https://api.semaphore.co/api/v4/messages';

/** Documented response: an array with one record per message (status Queued/Pending/Sent/Failed/Refunded). */
const SemaphoreResponseSchema = z
  .array(z.object({ message_id: z.union([z.number(), z.string()]), status: z.string() }))
  .min(1);

interface SemaphoreOptions {
  apiKey: string;
  /** Registered sender name; omitted = the account's default. */
  senderName?: string;
  timeoutMs?: number;
  /** Injected in tests. */
  fetchFn?: typeof fetch;
}

/**
 * Semaphore (semaphore.co, Philippines): POST /api/v4/messages, form-encoded.
 * Numbers go out as 639XXXXXXXXX. The API key is never logged or put in errors.
 */
export function createSemaphoreProvider(opts: SemaphoreOptions): SmsProvider {
  const { apiKey, senderName, timeoutMs = 10_000, fetchFn = fetch } = opts;
  const redact = (text: string) => text.split(apiKey).join('***').slice(0, 200);

  return {
    name: 'semaphore',
    simulated: false,
    async send(to, text) {
      const form = new URLSearchParams({
        apikey: apiKey,
        number: to.replace(/^\+/, ''),
        message: text,
      });
      if (senderName) form.set('sendername', senderName);

      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      let res: Response;
      try {
        res = await fetchFn(SEMAPHORE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
          signal: controller.signal,
        });
      } catch {
        throw new Error('Could not reach Semaphore (check the laptop’s internet connection)');
      } finally {
        clearTimeout(timer);
      }

      const raw = await res.text();
      if (!res.ok) throw new Error(`Semaphore answered HTTP ${res.status}: ${redact(raw)}`);

      let json: unknown;
      try {
        json = JSON.parse(raw) as unknown;
      } catch {
        throw new Error(`Semaphore sent an unreadable answer: ${redact(raw)}`);
      }
      const parsed = SemaphoreResponseSchema.safeParse(json);
      // Errors such as a wrong key or a missing sender name come back as a non-record body.
      if (!parsed.success) throw new Error(`Semaphore rejected the message: ${redact(raw)}`);
      const first = parsed.data[0];
      if (!first) throw new Error('Semaphore returned no message record');
      if (/^(failed|refunded)$/i.test(first.status)) {
        throw new Error(`Semaphore reports the message as ${first.status.toLowerCase()}`);
      }
      return { id: String(first.message_id) };
    },
  };
}

export function createSmsProvider(config: {
  SMS_PROVIDER: 'console' | 'semaphore';
  SEMAPHORE_API_KEY?: string | undefined;
  SEMAPHORE_SENDER_NAME?: string | undefined;
}): SmsProvider {
  if (config.SMS_PROVIDER === 'semaphore' && config.SEMAPHORE_API_KEY) {
    return createSemaphoreProvider({
      apiKey: config.SEMAPHORE_API_KEY,
      senderName: config.SEMAPHORE_SENDER_NAME,
    });
  }
  return createConsoleProvider();
}
