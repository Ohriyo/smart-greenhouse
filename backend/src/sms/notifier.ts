import type { AlertMetric } from '../domain/schemas.js';
import { createLogger } from '../lib/logger.js';
import {
  manilaClock,
  offlineMessage,
  onlineMessage,
  recoveryMessage,
  testMessage,
  thresholdMessage,
} from './messages.js';
import { maskPhone } from './phone.js';
import type { SmsProvider } from './provider.js';
import {
  DELIVERED,
  type NewSmsAlert,
  type SmsAlertRow,
  type SmsCondition,
  type SmsStore,
} from './store.js';

const log = createLogger('sms');

const MIN_MS = 60_000;
const DAY_MS = 24 * 60 * MIN_MS;
/** A HIGH/LOW or OFFLINE text older than this gets no "back to normal" text (stale). */
export const CLOSING_MAX_AGE_MS = 48 * 60 * MIN_MS;
/** An outage longer than this is not announced (the owner knew long ago). */
export const OFFLINE_MAX_AGE_MS = DAY_MS;
/** A failed / capped offline or back-online text is retried at most this often. */
export const RETRY_FAILED_MS = 15 * MIN_MS;
export const TEST_LIMIT_PER_HOUR = 5;

/** A reading crossed a limit (HIGH/LOW) or came back inside it (NORMAL): from the rules engine. */
export interface SmsCandidate {
  deviceId: string;
  metric: AlertMetric;
  condition: 'HIGH' | 'LOW' | 'NORMAL';
  value: number;
  /** The limit that was crossed (HIGH/LOW). */
  limit: number | null;
  /** The in-app alert created for it, if any. */
  alertId: number | null;
}

export interface SmsStatusOverview {
  provider: 'semaphore';
  dryRun: boolean;
  /** Masked. */
  recipients: string[];
  cooldownMinutes: number;
  dailyCap: number;
  offlineAfterMinutes: number;
  sentLast24h: number;
  /** Newest attempts first (10). */
  recent: SmsAlertRow[];
}

export type TestOutcome =
  | { outcome: 'no-recipients' }
  | { outcome: 'throttled' }
  | { outcome: 'done'; attempt: SmsAlertRow };

export interface SmsNotifier {
  readonly dryRun: boolean;
  /** A crossing or recovery from the rules engine. Never throws. */
  onCandidate(candidate: SmsCandidate): Promise<void>;
  /** Periodic (every 30 s): greenhouse offline for N minutes, back online. Never throws. */
  sweep(): Promise<void>;
  /** One test SMS to every recipient (POST /api/alerts/test). */
  sendTest(): Promise<TestOutcome>;
  status(): Promise<SmsStatusOverview>;
  /** Resolves when all queued SMS work is done (tests, shutdown). */
  idle(): Promise<void>;
}

interface Deps {
  store: SmsStore;
  /** Required unless dryRun (env validation guarantees it). */
  provider: SmsProvider | null;
  /** SMS_DRY_RUN: record and log every SMS as "dry_run", never call the provider. */
  dryRun: boolean;
  /** ALERT_PHONE_NUMBERS, normalized (09XXXXXXXXX). Empty = SMS off. */
  recipients: readonly string[];
  /** ALERT_COOLDOWN_MINUTES: no repeat for the same sensor+condition within it. */
  cooldownMs: number;
  /** SMS_DAILY_CAP: sent alert SMS per rolling 24 h (tests excluded). */
  dailyCap: number;
  /** SMS_OFFLINE_AFTER_MINUTES. */
  offlineAfterMs: number;
  /** Injected in tests. */
  clock?: () => number;
}

type Draft = Omit<NewSmsAlert, 'createdAt' | 'message' | 'recipients' | 'status' | 'providerResponse'>;

/**
 * SMS alerts to ALERT_PHONE_NUMBERS (docs/api-contract.md §7):
 *
 * - a reading crosses a limit (any severity): one SMS, unless the same sensor and
 *   condition (HIGH/LOW) was texted less than ALERT_COOLDOWN_MINUTES ago
 *   → recorded as "skipped_cooldown"
 * - it comes back inside the limit: one "back to normal" SMS, only if its HIGH/LOW
 *   was texted (and not more than 48 h ago)
 * - the greenhouse sends nothing for SMS_OFFLINE_AFTER_MINUTES: one SMS; one more
 *   when it's back
 * - every attempt is stored (SmsAlert); a failed send never blocks anything
 * - SMS_DAILY_CAP limits real SMS per rolling 24 h; SMS_DRY_RUN never calls the provider
 */
export function createSmsNotifier(deps: Deps): SmsNotifier {
  const { store, provider, dryRun, recipients, cooldownMs, dailyCap, offlineAfterMs } = deps;
  const clock = deps.clock ?? Date.now;
  const masked = recipients.map(maskPhone);

  // One task at a time: the cooldown and pairing checks can't race each other.
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  }
  /** Never lets an error escape into the alert pipeline or the sweep timer. */
  function safely(what: string, task: () => Promise<void>): Promise<void> {
    return serial(task).catch((err: unknown) => {
      log.error(`${what} failed`, err);
    });
  }

  function record(draft: Draft, message: string, status: NewSmsAlert['status'], providerResponse: string | null) {
    return store.record({
      ...draft,
      createdAt: new Date(clock()),
      message,
      recipients: masked.join(', '),
      status,
      providerResponse,
    });
  }

  /** Sends (or dry-runs) one SMS to every recipient and records the attempt. */
  async function deliver(draft: Draft, message: string): Promise<SmsAlertRow> {
    if (dryRun) {
      log.info(`[dry run, not sent] SMS to ${masked.join(', ')}: "${message}"`);
      return record(draft, message, 'dry_run', null);
    }
    if (draft.kind !== 'test') {
      const sent = await store.countSentSince(new Date(clock() - DAY_MS));
      if (sent >= dailyCap) {
        log.warn(`SMS not sent (${draft.kind}): daily limit of ${dailyCap} reached`);
        return record(draft, message, 'skipped_daily_cap', `daily limit of ${dailyCap} SMS reached`);
      }
    }
    if (!provider) {
      return record(draft, message, 'failed', 'no SMS provider configured (SEMAPHORE_API_KEY)');
    }
    let result: { ok: boolean; providerResponse: string };
    try {
      result = await provider.send(recipients, message);
    } catch (err) {
      // Providers shouldn't throw; if one does, it is still just a failed attempt.
      result = { ok: false, providerResponse: err instanceof Error ? err.message : String(err) };
    }
    if (result.ok) log.info(`SMS sent (${draft.kind}) to ${masked.length} recipient(s)`);
    else log.warn(`SMS failed (${draft.kind}): ${result.providerResponse}`);
    return record(draft, message, result.ok ? 'sent' : 'failed', result.providerResponse);
  }

  async function handleCandidate(c: SmsCandidate): Promise<void> {
    if (recipients.length === 0) return;
    const now = clock();
    const base = { deviceId: c.deviceId, alertId: c.alertId, sensor: c.metric, value: c.value };

    if (c.condition === 'NORMAL') {
      const last = await store.lastDelivered({
        deviceId: c.deviceId,
        sensor: c.metric,
        conditions: ['HIGH', 'LOW', 'NORMAL'],
      });
      if (!last || last.condition === 'NORMAL') return; // nothing was announced
      if (now - last.createdAt.getTime() > CLOSING_MAX_AGE_MS) return; // stale
      await deliver(
        { ...base, kind: 'recovery', condition: 'NORMAL', threshold: null },
        recoveryMessage({ metric: c.metric, value: c.value, at: now }),
      );
      return;
    }

    const draft: Draft = { ...base, kind: 'threshold', condition: c.condition, threshold: c.limit };
    const message = thresholdMessage({
      metric: c.metric,
      condition: c.condition,
      value: c.value,
      limit: c.limit,
      at: now,
    });
    const last = await store.lastDelivered({
      deviceId: c.deviceId,
      sensor: c.metric,
      conditions: [c.condition],
    });
    if (last && now - last.createdAt.getTime() < cooldownMs) {
      const why =
        `same sensor and condition texted at ${manilaClock(last.createdAt.getTime())}; ` +
        `cooldown ${Math.round(cooldownMs / MIN_MS)} min`;
      log.info(`SMS skipped (${c.metric} ${c.condition}): ${why}`);
      await record(draft, message, 'skipped_cooldown', why);
      return;
    }
    await deliver(draft, message);
  }

  /** Waits out RETRY_FAILED_MS after a failed/capped attempt (no retry storm every 30 s). */
  function retryTooSoon(last: SmsAlertRow | null, condition: SmsCondition, since: number, now: number) {
    return (
      last !== null &&
      last.condition === condition &&
      last.createdAt.getTime() >= since &&
      (DELIVERED.includes(last.status) || now - last.createdAt.getTime() < RETRY_FAILED_MS)
    );
  }

  async function handleSweep(): Promise<void> {
    if (recipients.length === 0) return;
    const now = clock();
    for (const d of await store.listDevices()) {
      const q = { deviceId: d.id, sensor: null, conditions: ['OFFLINE', 'ONLINE'] as const };
      if (!d.online && d.lastSeen) {
        const silentMs = now - d.lastSeen.getTime();
        if (silentMs < offlineAfterMs || silentMs > OFFLINE_MAX_AGE_MS) continue;
        // Already announced (or just tried) during this outage?
        const last = await store.lastAttempt(q);
        if (retryTooSoon(last, 'OFFLINE', d.lastSeen.getTime(), now)) continue;
        await deliver(
          {
            kind: 'offline',
            deviceId: d.id,
            alertId: await store.latestAlertId(d.id, 'offline'),
            sensor: null,
            condition: 'OFFLINE',
            value: null,
            threshold: null,
          },
          offlineMessage({ name: d.name, minutes: silentMs / MIN_MS, lastSeen: d.lastSeen.getTime() }),
        );
      } else if (d.online) {
        // Back online after an announced outage → one closing SMS.
        const announced = await store.lastDelivered(q);
        if (announced?.condition !== 'OFFLINE') continue;
        const announcedAt = announced.createdAt.getTime();
        if (now - announcedAt > CLOSING_MAX_AGE_MS) continue;
        if (retryTooSoon(await store.lastAttempt(q), 'ONLINE', announcedAt, now)) continue;
        await deliver(
          {
            kind: 'online',
            deviceId: d.id,
            alertId: await store.latestAlertId(d.id, 'online'),
            sensor: null,
            condition: 'ONLINE',
            value: null,
            threshold: null,
          },
          onlineMessage({ name: d.name, at: now }),
        );
      }
    }
  }

  return {
    dryRun,
    onCandidate: (candidate) => safely('alert SMS', () => handleCandidate(candidate)),
    sweep: () => safely('SMS sweep', handleSweep),

    sendTest: () =>
      serial(async (): Promise<TestOutcome> => {
        if (recipients.length === 0) return { outcome: 'no-recipients' };
        const now = clock();
        if ((await store.countTestsSince(new Date(now - 60 * MIN_MS))) >= TEST_LIMIT_PER_HOUR) {
          return { outcome: 'throttled' };
        }
        const attempt = await deliver(
          {
            kind: 'test',
            deviceId: null,
            alertId: null,
            sensor: null,
            condition: 'TEST',
            value: null,
            threshold: null,
          },
          testMessage(now),
        );
        return { outcome: 'done', attempt };
      }),

    async status() {
      const [sentLast24h, recent] = await Promise.all([
        store.countSentSince(new Date(clock() - DAY_MS)),
        store.recent(10),
      ]);
      return {
        provider: 'semaphore',
        dryRun,
        recipients: masked,
        cooldownMinutes: Math.round(cooldownMs / MIN_MS),
        dailyCap,
        offlineAfterMinutes: Math.round(offlineAfterMs / MIN_MS),
        sentLast24h,
        recent,
      };
    },

    async idle() {
      await tail;
    },
  };
}
