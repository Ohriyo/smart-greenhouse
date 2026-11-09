import { prisma } from '../db.js';
import { FanModeSchema, type FanMode } from '../domain/schemas.js';

const SETTINGS_ID = 1;

export interface SmsSettingsRow {
  enabled: boolean;
  phone: string | null;
  offlineAfterMin: number;
  updatedAt: Date;
}

export type SmsKind = 'critical' | 'offline' | 'closing' | 'test';
export type SmsStatus = 'sent' | 'failed' | 'skipped';

export interface NewSmsLog {
  kind: SmsKind;
  deviceId: string | null;
  metric: string | null;
  body: string;
  status: SmsStatus;
  error: string | null;
  providerId: string | null;
}

export interface SmsLogRow {
  ts: Date;
  kind: SmsKind;
  status: SmsStatus;
  error: string | null;
}

export interface EpisodeRow {
  id: number;
  deviceId: string;
  /** "airTemp" | "humidity" | "soilMoisture" | "lux" | "offline" */
  metric: string;
  openedAt: Date;
  /** Air temperature is back in range but the fan still runs. */
  recoveredAt: Date | null;
}

export interface DeviceInfo {
  id: string;
  name: string;
  online: boolean;
  lastSeen: Date | null;
}

export interface LatestReadingInfo {
  airTemp: number | null;
  fanOn: boolean;
  fanMode: FanMode;
}

/** Everything the SMS logic needs from the database. Faked in tests. */
export interface SmsStore {
  getSettings(): Promise<SmsSettingsRow>;
  saveSettings(body: {
    enabled: boolean;
    phone: string | null;
    offlineAfterMin: number;
  }): Promise<SmsSettingsRow>;
  /** Alert SMS (not tests) that were sent since `since`: the daily cap. */
  countSentSince(since: Date): Promise<number>;
  /** Test SMS attempted since `since`: throttling. */
  countTestsSince(since: Date): Promise<number>;
  addLog(entry: NewSmsLog): Promise<void>;
  lastLog(): Promise<SmsLogRow | null>;
  findOpenEpisode(deviceId: string, metric: string): Promise<EpisodeRow | null>;
  listOpenEpisodes(): Promise<EpisodeRow[]>;
  openEpisode(deviceId: string, metric: string, at: Date): Promise<void>;
  markRecovered(id: number, at: Date): Promise<void>;
  closeEpisode(id: number, at: Date): Promise<void>;
  getDevice(id: string): Promise<DeviceInfo | null>;
  listDevices(): Promise<DeviceInfo[]>;
  latestReading(deviceId: string): Promise<LatestReadingInfo | null>;
}

export function createPrismaSmsStore(): SmsStore {
  return {
    getSettings: () =>
      prisma.smsSettings.upsert({
        where: { id: SETTINGS_ID },
        update: {},
        create: { id: SETTINGS_ID },
      }),

    saveSettings: (body) =>
      prisma.smsSettings.upsert({
        where: { id: SETTINGS_ID },
        update: body,
        create: { id: SETTINGS_ID, ...body },
      }),

    countSentSince: (since) =>
      prisma.smsLog.count({
        where: { status: 'sent', kind: { not: 'test' }, ts: { gte: since } },
      }),

    countTestsSince: (since) =>
      prisma.smsLog.count({ where: { kind: 'test', ts: { gte: since } } }),

    async addLog(entry) {
      await prisma.smsLog.create({ data: entry });
    },

    async lastLog() {
      const row = await prisma.smsLog.findFirst({ orderBy: { id: 'desc' } });
      if (!row) return null;
      return {
        ts: row.ts,
        kind: row.kind as SmsKind,
        status: row.status as SmsStatus,
        error: row.error,
      };
    },

    findOpenEpisode: (deviceId, metric) =>
      prisma.smsEpisode.findFirst({
        where: { deviceId, metric, closedAt: null },
        orderBy: { id: 'desc' },
      }),

    listOpenEpisodes: () => prisma.smsEpisode.findMany({ where: { closedAt: null } }),

    async openEpisode(deviceId, metric, at) {
      await prisma.smsEpisode.create({ data: { deviceId, metric, openedAt: at } });
    },

    async markRecovered(id, at) {
      await prisma.smsEpisode.update({ where: { id }, data: { recoveredAt: at } });
    },

    async closeEpisode(id, at) {
      await prisma.smsEpisode.update({ where: { id }, data: { closedAt: at } });
    },

    getDevice: (id) => prisma.device.findUnique({ where: { id } }),

    listDevices: () => prisma.device.findMany(),

    async latestReading(deviceId) {
      const r = await prisma.reading.findFirst({
        where: { deviceId },
        orderBy: { ts: 'desc' },
        select: { airTemp: true, fanOn: true, fanMode: true },
      });
      if (!r) return null;
      return {
        airTemp: r.airTemp,
        fanOn: r.fanOn,
        fanMode: FanModeSchema.catch('auto').parse(r.fanMode),
      };
    },
  };
}
