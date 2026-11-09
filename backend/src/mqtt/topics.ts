import { DeviceIdSchema } from '../domain/schemas.js';

export const topics = {
  telemetry: (deviceId: string) => `greenhouse/${deviceId}/telemetry`,
  status: (deviceId: string) => `greenhouse/${deviceId}/status`,
  command: (deviceId: string) => `greenhouse/${deviceId}/command`,
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
