import { DeviceIdSchema } from '../domain/schemas.js';

export const topics = {
  telemetry: (deviceId: string) => `greenhouse/${deviceId}/telemetry`,
  status: (deviceId: string) => `greenhouse/${deviceId}/status`,
  command: (deviceId: string) => `greenhouse/${deviceId}/command`,
  /** Dev-only: Demo scenarios for the simulator (never used by the real firmware). */
  sim: (deviceId: string) => `greenhouse/${deviceId}/sim`,
};

export const SUBSCRIPTIONS = ['greenhouse/+/telemetry', 'greenhouse/+/status'];

export type InboundKind = 'telemetry' | 'status';

export function parseTopic(topic: string): { deviceId: string; kind: InboundKind } | null {
  const parts = topic.split('/');
  if (parts.length !== 3 || parts[0] !== 'greenhouse') return null;
  const [, deviceId, kind] = parts;
  if (kind !== 'telemetry' && kind !== 'status') return null;
  const id = DeviceIdSchema.safeParse(deviceId);
  return id.success ? { deviceId: id.data, kind } : null;
}
