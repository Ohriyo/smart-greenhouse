import {
  DeviceListSchema,
  HealthSchema,
  LatestSchema,
  ThresholdsSchema,
  type Device,
  type Health,
  type Latest,
  type Thresholds,
} from '@/types/api';

import { apiRequest } from './client';

/** Typed endpoint functions (docs/api-contract.md §2). */
export const api = {
  health: (opts?: { baseUrl?: string; signal?: AbortSignal }): Promise<Health> =>
    apiRequest('/api/health', HealthSchema, { ...opts, timeoutMs: 5000 }),

  devices: (signal?: AbortSignal): Promise<Device[]> =>
    apiRequest('/api/devices', DeviceListSchema, { signal }),

  latest: (deviceId: string, signal?: AbortSignal): Promise<Latest> =>
    apiRequest(`/api/devices/${encodeURIComponent(deviceId)}/latest`, LatestSchema, { signal }),

  thresholds: (deviceId: string, signal?: AbortSignal): Promise<Thresholds> =>
    apiRequest(`/api/devices/${encodeURIComponent(deviceId)}/thresholds`, ThresholdsSchema, {
      signal,
    }),
};
