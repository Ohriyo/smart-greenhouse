import { DeviceIdSchema } from '../domain/schemas.js';

/** MQTT topics (docs/api-contract.md §4). */
export const topics = {
  /** Device → backend: one reading (same JSON as POST /api/readings). */
  telemetry: (deviceId: string) => `greenhouse/${deviceId}/telemetry`,
  /** Device → backend: "online" / "offline" (retained; "offline" is the Last Will). */
  status: (deviceId: string) => `greenhouse/${deviceId}/status`,
  /** Backend → device: one command (calibrateSoil, or simulate for the simulator). */
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
