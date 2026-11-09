import type {
  ExpoPushMessage,
  ExpoPushReceipt,
  ExpoPushReceiptId,
  ExpoPushTicket,
} from 'expo-server-sdk';
import type { AlertDto } from '../domain/dto.js';
import type { Severity } from '../domain/schemas.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('push');

/** Android channel created by the app (src/services/notifications). Must match. */
export const ALERT_CHANNEL_ID = 'greenhouse-alerts';
/** Route the app opens when the notification is tapped. */
export const ALERTS_URL = '/alerts';

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };
/** Every alert push has this title; the body carries the alert's own text (incl. "very high" for critical). */
export const ALERT_TITLE = 'Greenhouse alert';

/** The prototype's sample notification, for the Demo sheet. */
export const DEMO_PUSH = {
  title: ALERT_TITLE,
  body: 'Air temperature 33.1 °C — fan turned on',
} as const;

/** Expo recommends checking receipts ~15 min after sending (they live ~24 h). */
const DEFAULT_RECEIPT_DELAY_MS = 15 * 60_000;
/** A receipt that is still missing after this many checks is dropped. */
const MAX_RECEIPT_CHECKS = 3;

/** The parts of the `Expo` client we use (lets tests pass a fake). */
export interface PushClient {
  chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][];
  sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
  chunkPushNotificationReceiptIds(ids: ExpoPushReceiptId[]): ExpoPushReceiptId[][];
  getPushNotificationReceiptsAsync(
    ids: ExpoPushReceiptId[],
  ): Promise<Record<string, ExpoPushReceipt>>;
}

export interface PushStore {
  getSettings(): Promise<{ enabled: boolean; minSeverity: string }>;
  listTokens(): Promise<string[]>;
  removeTokens(tokens: string[]): Promise<number>;
}

export interface SendResult {
  tokens: number;
  sent: number;
  failed: number;
  removed: number;
}

export interface PushSender {
  /** Push an alert to every registered phone if the preferences allow it. Never throws. */
  notifyAlert(alert: AlertDto): Promise<SendResult | null>;
  /**
   * Push a test notification to every registered phone (ignores preferences).
   * `demo` = the prototype's sample alert ("Greenhouse alert" / "Air temperature 33.1 °C — fan turned on").
   */
  sendTest(preset?: 'demo'): Promise<SendResult>;
  /** Check pending receipts now (normally runs on a timer). */
  checkReceipts(): Promise<void>;
  stop(): void;
}

function isSeverity(v: string): v is Severity {
  return v in SEVERITY_RANK;
}

/** Whether an alert of `severity` should be pushed with these preferences. */
export function shouldPush(
  severity: Severity,
  settings: { enabled: boolean; minSeverity: string },
): boolean {
  if (!settings.enabled) return false;
  const min = isSeverity(settings.minSeverity) ? settings.minSeverity : 'warning';
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[min];
}

export function alertMessage(to: string, alert: AlertDto): ExpoPushMessage {
  return {
    to,
    title: ALERT_TITLE,
    body: alert.message,
    sound: 'default',
    priority: 'high', // wakes the phone from Doze (Android)
    channelId: ALERT_CHANNEL_ID,
    ttl: 24 * 3600, // phone off for a day: the alert is old news
    data: { url: ALERTS_URL, alertId: alert.id, deviceId: alert.deviceId },
  };
}

export function createPushSender(opts: {
  client: PushClient;
  store: PushStore;
  enabled: boolean;
  receiptDelayMs?: number;
}): PushSender {
  const { client, store, enabled } = opts;
  const receiptDelayMs = opts.receiptDelayMs ?? DEFAULT_RECEIPT_DELAY_MS;

  /** receipt id → token it was sent to, and how often we looked for it. */
  const pending = new Map<ExpoPushReceiptId, { token: string; checks: number }>();
  let timer: NodeJS.Timeout | undefined;

  function scheduleReceiptCheck(): void {
    if (timer || pending.size === 0) return;
    timer = setTimeout(() => {
      timer = undefined;
      void checkReceipts();
    }, receiptDelayMs);
    timer.unref(); // don't keep the process alive for it
  }

  async function removeDead(tokens: string[]): Promise<number> {
    if (tokens.length === 0) return 0;
    const removed = await store.removeTokens(tokens);
    log.info(`removed ${removed} unregistered push token(s) (DeviceNotRegistered)`);
    return removed;
  }

  async function send(messages: ExpoPushMessage[]): Promise<SendResult> {
    const result: SendResult = { tokens: messages.length, sent: 0, failed: 0, removed: 0 };
    const dead: string[] = [];

    for (const chunk of client.chunkPushNotifications(messages)) {
      let tickets: ExpoPushTicket[];
      try {
        tickets = await client.sendPushNotificationsAsync(chunk);
      } catch (err) {
        // Whole request failed: no internet on the laptop, Expo down, ...
        result.failed += chunk.length;
        log.warn(`push request failed: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      // Tickets are in the same order as the messages.
      tickets.forEach((ticket, i) => {
        const to = chunk[i]?.to;
        const token = typeof to === 'string' ? to : '';
        if (ticket.status === 'ok') {
          result.sent++;
          pending.set(ticket.id, { token, checks: 0 });
        } else {
          result.failed++;
          if (ticket.details?.error === 'DeviceNotRegistered') dead.push(token);
          else log.warn(`push ticket error for ${token}: ${ticket.message}`);
        }
      });
    }

    result.removed = await removeDead(dead);
    scheduleReceiptCheck();
    return result;
  }

  async function checkReceipts(): Promise<void> {
    const ids = [...pending.keys()];
    if (ids.length === 0) return;
    const dead: string[] = [];

    for (const chunk of client.chunkPushNotificationReceiptIds(ids)) {
      let receipts: Record<string, ExpoPushReceipt>;
      try {
        receipts = await client.getPushNotificationReceiptsAsync(chunk);
      } catch (err) {
        log.warn(`receipt request failed: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      for (const id of chunk) {
        const entry = pending.get(id);
        if (!entry) continue;
        const receipt = receipts[id];
        if (!receipt) {
          // Not ready yet: try again later, but not forever.
          entry.checks++;
          if (entry.checks >= MAX_RECEIPT_CHECKS) pending.delete(id);
          continue;
        }
        pending.delete(id);
        if (receipt.status === 'error') {
          if (receipt.details?.error === 'DeviceNotRegistered') dead.push(entry.token);
          else log.warn(`push receipt error for ${entry.token}: ${receipt.message}`);
        }
      }
    }

    await removeDead([...new Set(dead)]);
    scheduleReceiptCheck();
  }

  return {
    async notifyAlert(alert) {
      if (!enabled) return null;
      try {
        const settings = await store.getSettings();
        if (!shouldPush(alert.severity, settings)) return null;
        const tokens = await store.listTokens();
        if (tokens.length === 0) return null;
        const result = await send(tokens.map((t) => alertMessage(t, alert)));
        log.info(
          `alert ${alert.id} pushed to ${result.sent}/${result.tokens} phone(s)` +
            (result.failed ? `, ${result.failed} failed` : ''),
        );
        return result;
      } catch (err) {
        log.error(`push for alert ${alert.id} failed`, err);
        return null;
      }
    },

    async sendTest(preset) {
      const tokens = await store.listTokens();
      const content =
        preset === 'demo'
          ? DEMO_PUSH
          : {
              title: 'ETanim',
              body: 'Test notification: push alerts work on this phone.',
            };
      return send(
        tokens.map((to) => ({
          to,
          title: content.title,
          body: content.body,
          sound: 'default',
          priority: 'high',
          channelId: ALERT_CHANNEL_ID,
          data: { url: ALERTS_URL },
        })),
      );
    },

    checkReceipts,

    stop() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
