import type { AlertDto, FanStateDto } from '../domain/dto.js';
import { createLogger } from '../lib/logger.js';
import {
  airTempBackMessage,
  backInRangeMessage,
  backOnlineMessage,
  criticalMessage,
  offlineMessage,
  stabilizedMessage,
  testMessage,
} from './messages.js';
import type { SmsProvider } from './provider.js';
import type {
  EpisodeRow,
  SmsKind,
  SmsLogRow,
  SmsSettingsRow,
  SmsStatus,
  SmsStore,
} from './store.js';

const log = createLogger('sms');

const MIN_MS = 60_000;
const DAY_MS = 24 * 60 * MIN_MS;
/** Air temp back in range but the fan still runs: stop waiting for it to switch off after this. */
export const STABILIZE_TIMEOUT_MS = 2 * 60 * MIN_MS;
/** A critical situation announced this long ago is closed silently (no stale "all clear"). */
export const EPISODE_MAX_AGE_MS = 48 * 60 * MIN_MS;
/** An offline greenhouse older than this is not announced (the owner knew long ago). */
export const OFFLINE_MAX_AGE_MS = DAY_MS;
export const TEST_LIMIT_PER_HOUR = 5;

interface Delivery {
  status: SmsStatus;
  error: string | null;
}

export interface SmsOverview {
  settings: SmsSettingsRow;
  provider: { name: string; simulated: boolean };
  dailyCap: number;
  sentLast24h: number;
  last: SmsLogRow | null;
}

export type TestOutcome =
  | { outcome: 'no-phone' }
  | { outcome: 'throttled' }
  | { outcome: 'done'; status: SmsStatus; error: string | null; simulated: boolean };

export interface SmsNotifier {
  /** A new alert from the rules engine. Critical breaches are announced; recoveries close them. */
  onAlert(alert: AlertDto): Promise<void>;
  /** A confirmed fan change: "fan turned OFF" closes an air-temperature episode. */
  onFanEvent(event: FanStateDto): Promise<void>;
  /** Periodic: greenhouse offline for N minutes, back online, stale episodes. */
  sweep(): Promise<void>;
  sendTest(): Promise<TestOutcome>;
  overview(): Promise<SmsOverview>;
  saveSettings(body: {
    enabled: boolean;
    phone: string | null;
    offlineAfterMin: number;
  }): Promise<SmsOverview>;
}

interface Deps {
  store: SmsStore;
  provider: SmsProvider;
  dailyCap: number;
  /** Injected in tests. */
  clock?: () => number;
}

/**
 * SMS to the owner, for the situations that need action:
 *
 * - a CRITICAL reading (air temp, humidity, soil, light): one SMS when it starts.
 *   Air temperature also says what the fan is doing (as confirmed by the device).
 * - the greenhouse offline for more than N minutes: one SMS.
 * - when it's over, one closing SMS. For air temperature "over" means the fan
 *   switched OFF after the temperature settled; if the fan is held on by hand (or
 *   never switches off) the closing SMS says the fan is still on.
 *
 * Open situations are stored in the database (SmsEpisode), so a backend restart
 * neither repeats an SMS nor loses the closing one. An episode exists only if its
 * opening SMS was actually sent. A daily cap stops runaway costs.
 */
export function createSmsNotifier({
  store,
  provider,
  dailyCap,
  clock = Date.now,
}: Deps): SmsNotifier {
  // All work runs one task at a time: telemetry, fan events and the sweep can't interleave.
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

  async function deviceName(deviceId: string): Promise<string> {
    return (await store.getDevice(deviceId))?.name ?? deviceId;
  }

  /** Sends one SMS, enforcing the daily cap, and records the result. Never throws for provider errors. */
  async function deliver(
    kind: SmsKind,
    deviceId: string | null,
    metric: string | null,
    body: string,
    phone: string,
  ): Promise<Delivery> {
    const base = { kind, deviceId, metric, body, providerId: null };
    if (kind !== 'test') {
      const sent = await store.countSentSince(new Date(clock() - DAY_MS));
      if (sent >= dailyCap) {
        const error = `daily limit of ${dailyCap} SMS reached`;
        await store.addLog({ ...base, status: 'skipped', error });
        log.warn(`SMS not sent (${kind}): ${error}`);
        return { status: 'skipped', error };
      }
    }
    try {
      const { id } = await provider.send(phone, body);
      await store.addLog({ ...base, status: 'sent', error: null, providerId: id });
      return { status: 'sent', error: null };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await store.addLog({ ...base, status: 'failed', error });
      log.warn(`SMS failed (${kind}): ${error}`);
      return { status: 'failed', error };
    }
  }

  /** Settings with a usable number and SMS turned on, or null. */
  async function active(): Promise<(SmsSettingsRow & { phone: string }) | null> {
    const settings = await store.getSettings();
    return settings.enabled && settings.phone ? { ...settings, phone: settings.phone } : null;
  }

  async function handleAlert(alert: AlertDto): Promise<void> {
    const settings = await active();
    if (!settings || !alert.metric) return;
    const { deviceId, metric } = alert;
    const now = new Date(clock());

    // 1. A critical reading starts an episode (announced once).
    if (
      (alert.type === 'above_max' || alert.type === 'below_min') &&
      alert.severity === 'critical' &&
      alert.value !== null
    ) {
      if (await store.findOpenEpisode(deviceId, metric)) return;
      const latest = await store.latestReading(deviceId);
      const body = criticalMessage({
        metric,
        type: alert.type,
        value: alert.value,
        limit: alert.limit,
        name: await deviceName(deviceId),
        fan: latest ? { on: latest.fanOn, mode: latest.fanMode } : null,
      });
      const result = await deliver('critical', deviceId, metric, body, settings.phone);
      if (result.status === 'sent') await store.openEpisode(deviceId, metric, now);
      return;
    }

    // 2. The reading is back in range: close the episode, if one was announced.
    if (alert.type === 'recovered') {
      const episode = await store.findOpenEpisode(deviceId, metric);
      if (!episode) return;
      const name = await deviceName(deviceId);

      if (metric !== 'airTemp') {
        const body = backInRangeMessage({ metric, value: alert.value, name });
        await deliver('closing', deviceId, metric, body, settings.phone);
        await store.closeEpisode(episode.id, now);
        return;
      }

      // Air temperature: "stabilized" = the fan switched off by itself. While it still
      // runs in auto mode, wait for that (onFanEvent), up to STABILIZE_TIMEOUT_MS.
      const latest = await store.latestReading(deviceId);
      if (latest?.fanOn && latest.fanMode === 'auto') {
        await store.markRecovered(episode.id, now);
        return;
      }
      const body = airTempBackMessage({
        value: alert.value,
        name,
        fan: latest ? { on: latest.fanOn, mode: latest.fanMode } : null,
      });
      await deliver('closing', deviceId, metric, body, settings.phone);
      await store.closeEpisode(episode.id, now);
    }
  }

  async function handleFanEvent(event: FanStateDto): Promise<void> {
    if (event.fanOn) return;
    const settings = await active();
    if (!settings) return;
    const episode = await store.findOpenEpisode(event.deviceId, 'airTemp');
    // Only after the temperature came back in range (a manual "off" during the
    // emergency is not "stabilized").
    if (!episode?.recoveredAt) return;
    const body = stabilizedMessage({
      value: event.airTemp,
      name: await deviceName(event.deviceId),
    });
    await deliver('closing', event.deviceId, 'airTemp', body, settings.phone);
    await store.closeEpisode(episode.id, new Date(clock()));
  }

  async function handleSweep(): Promise<void> {
    const now = clock();
    const settings = await active();
    const episodes = await store.listOpenEpisodes();

    // Housekeeping first, even with SMS off: nothing should stay "open" for ever.
    const stale = (e: EpisodeRow) =>
      now - e.openedAt.getTime() >
      (e.metric === 'offline' ? OFFLINE_MAX_AGE_MS : EPISODE_MAX_AGE_MS);
    for (const e of episodes.filter(stale)) await store.closeEpisode(e.id, new Date(now));
    if (!settings) return;
    const open = episodes.filter((e) => !stale(e));

    // Offline for more than N minutes → announce once.
    const devices = await store.listDevices();
    for (const d of devices) {
      if (d.online || !d.lastSeen) continue;
      const silentMs = now - d.lastSeen.getTime();
      if (silentMs < settings.offlineAfterMin * MIN_MS || silentMs > OFFLINE_MAX_AGE_MS) continue;
      if (await store.findOpenEpisode(d.id, 'offline')) continue;
      const body = offlineMessage({
        name: d.name,
        minutes: silentMs / MIN_MS,
        lastSeen: d.lastSeen.getTime(),
      });
      const result = await deliver('offline', d.id, 'offline', body, settings.phone);
      if (result.status === 'sent') await store.openEpisode(d.id, 'offline', new Date(now));
    }

    for (const e of open) {
      // Back online → closing SMS.
      if (e.metric === 'offline') {
        const device = devices.find((d) => d.id === e.deviceId);
        if (device?.online) {
          await deliver(
            'closing',
            e.deviceId,
            'offline',
            backOnlineMessage({ name: device.name }),
            settings.phone,
          );
          await store.closeEpisode(e.id, new Date(now));
        }
        continue;
      }
      // Air temp back in range for a long time but the fan never switched off.
      if (
        e.metric === 'airTemp' &&
        e.recoveredAt &&
        now - e.recoveredAt.getTime() >= STABILIZE_TIMEOUT_MS
      ) {
        const latest = await store.latestReading(e.deviceId);
        const body = airTempBackMessage({
          value: latest?.airTemp ?? null,
          name: await deviceName(e.deviceId),
          fan: latest ? { on: latest.fanOn, mode: latest.fanMode } : null,
        });
        await deliver('closing', e.deviceId, 'airTemp', body, settings.phone);
        await store.closeEpisode(e.id, new Date(now));
      }
    }
  }

  async function overview(): Promise<SmsOverview> {
    const [settings, sentLast24h, last] = await Promise.all([
      store.getSettings(),
      store.countSentSince(new Date(clock() - DAY_MS)),
      store.lastLog(),
    ]);
    return {
      settings,
      provider: { name: provider.name, simulated: provider.simulated },
      dailyCap,
      sentLast24h,
      last,
    };
  }

  return {
    onAlert: (alert) => safely('alert SMS', () => handleAlert(alert)),
    onFanEvent: (event) => safely('fan SMS', () => handleFanEvent(event)),
    sweep: () => safely('SMS sweep', handleSweep),

    sendTest: () =>
      serial(async (): Promise<TestOutcome> => {
        const settings = await store.getSettings();
        if (!settings.phone) return { outcome: 'no-phone' };
        const tests = await store.countTestsSince(new Date(clock() - 60 * MIN_MS));
        if (tests >= TEST_LIMIT_PER_HOUR) return { outcome: 'throttled' };
        const result = await deliver('test', null, null, testMessage(), settings.phone);
        return { outcome: 'done', ...result, simulated: provider.simulated };
      }),

    overview,

    async saveSettings(body) {
      await store.saveSettings(body);
      return overview();
    },
  };
}
