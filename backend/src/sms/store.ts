// SMS log types and pure helpers. No database import here (the Prisma
// implementation is in prismaStore.ts), so the SMS logic is testable without one.
import type { SmsAlert } from '../generated/prisma/client.js';

export type SmsKind = 'threshold' | 'recovery' | 'offline' | 'online' | 'test';
export type SmsCondition = 'HIGH' | 'LOW' | 'NORMAL' | 'OFFLINE' | 'ONLINE' | 'TEST';
export type SmsStatus = 'sent' | 'failed' | 'skipped_cooldown' | 'skipped_daily_cap' | 'dry_run';

/** Statuses that count as "the owner was told" (cooldown, back-to-normal pairing). */
export const DELIVERED: readonly SmsStatus[] = ['sent', 'dry_run'];

export interface NewSmsAlert {
  createdAt: Date;
  kind: SmsKind;
  deviceId: string | null;
  alertId: number | null;
  sensor: string | null;
  condition: SmsCondition;
  value: number | null;
  threshold: number | null;
  message: string;
  /** Masked, comma-separated. */
  recipients: string;
  status: SmsStatus;
  providerResponse: string | null;
}

export interface SmsAlertRow extends NewSmsAlert {
  id: number;
}

export interface DeviceInfo {
  id: string;
  name: string;
  online: boolean;
  lastSeen: Date | null;
}

export interface SmsQuery {
  deviceId: string;
  /** null for offline/online. */
  sensor: string | null;
  conditions: readonly SmsCondition[];
}

/** Everything the SMS logic needs from the database. Faked in tests. */
export interface SmsStore {
  record(row: NewSmsAlert): Promise<SmsAlertRow>;
  /** Newest delivered (sent / dry run) SMS matching the query. */
  lastDelivered(q: SmsQuery): Promise<SmsAlertRow | null>;
  /** Newest attempt of any status matching the query. */
  lastAttempt(q: SmsQuery): Promise<SmsAlertRow | null>;
  /** Alert SMS actually sent since `since` (tests and dry runs excluded): the daily cap. */
  countSentSince(since: Date): Promise<number>;
  /** Test SMS attempted since `since`: throttling. */
  countTestsSince(since: Date): Promise<number>;
  /** Newest attempts first. */
  recent(limit: number): Promise<SmsAlertRow[]>;
  listDevices(): Promise<DeviceInfo[]>;
  /** The newest in-app alert of that type for the device (to link offline/online SMS). */
  latestAlertId(deviceId: string, type: 'offline' | 'online'): Promise<number | null>;
}

const KINDS: readonly SmsKind[] = ['threshold', 'recovery', 'offline', 'online', 'test'];
const CONDITIONS: readonly SmsCondition[] = ['HIGH', 'LOW', 'NORMAL', 'OFFLINE', 'ONLINE', 'TEST'];
const STATUSES: readonly SmsStatus[] = [
  'sent',
  'failed',
  'skipped_cooldown',
  'skipped_daily_cap',
  'dry_run',
];

function oneOf<T extends string>(allowed: readonly T[], value: string, field: string): T {
  const found = allowed.find((a) => a === value);
  if (found === undefined) throw new Error(`SmsAlert.${field} has unexpected value "${value}"`);
  return found;
}

export function toSmsAlertRow(r: SmsAlert): SmsAlertRow {
  return {
    ...r,
    kind: oneOf(KINDS, r.kind, 'kind'),
    condition: oneOf(CONDITIONS, r.condition, 'condition'),
    status: oneOf(STATUSES, r.status, 'status'),
  };
}
