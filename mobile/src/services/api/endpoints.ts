import { z } from 'zod';

import {
  AlertPageSchema,
  AlertSchema,
  NotificationSettingsSchema,
  NotificationSettingsUpdateSchema,
  PushTestResultSchema,
  PushTokenSchema,
  ReadAllResponseSchema,
  type Alert,
  type AlertPage,
  type AlertsFilter,
  type NotificationSettings,
  type NotificationSettingsUpdate,
  type PushTestResult,
  type PushToken,
  type ReadAllResponse,
  DeviceListSchema,
  FanCommandResponseSchema,
  FanCommandSchema,
  HealthSchema,
  HistorySchema,
  SimulateResponseSchema,
  SmsSettingsSchema,
  SmsSettingsUpdateSchema,
  SmsTestResultSchema,
  SoilCalibrationBodySchema,
  SoilCalibrationResponseSchema,
  DevStatusSchema,
  DeviceRenameSchema,
  DeviceSchema,
  FanActivitySchema,
  HeatmapSchema,
  LatestSchema,
  RecentSchema,
  ThresholdsSchema,
  ThresholdsUpdateResponseSchema,
  ThresholdsUpdateSchema,
  type Device,
  type FanCommand,
  type FanCommandResponse,
  type ThresholdsUpdate,
  type ThresholdsUpdateResponse,
  type DevStatus,
  type SimScenario,
  type SimulateResponse,
  type SmsSettings,
  type SmsSettingsUpdate,
  type SmsTestResult,
  type SoilCalibrationResponse,
  type SoilPoint,
  type Health,
  type History,
  type HistoryMetric,
  type HistoryRange,
  type AlertMetric,
  type FanActivity,
  type Heatmap,
  type Latest,
  type Recent,
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

  /** Renames the greenhouse (the id never changes). */
  renameDevice: (deviceId: string, name: string): Promise<Device> =>
    apiRequest(`/api/devices/${encodeURIComponent(deviceId)}`, DeviceSchema, {
      method: 'PATCH',
      body: DeviceRenameSchema.parse({ name }),
    }),

  /** Raw readings of the last `minutes` (1–60), oldest first. */
  recent: (deviceId: string, minutes: number, signal?: AbortSignal): Promise<Recent> =>
    apiRequest(
      `/api/devices/${encodeURIComponent(deviceId)}/recent?minutes=${minutes}`,
      RecentSchema,
      { signal },
    ),

  fanActivity: (
    deviceId: string,
    range: HistoryRange,
    signal?: AbortSignal,
  ): Promise<FanActivity> =>
    apiRequest(
      `/api/devices/${encodeURIComponent(deviceId)}/fan-activity?range=${range}`,
      FanActivitySchema,
      { signal, timeoutMs: 15_000 },
    ),

  heatmap: (
    deviceId: string,
    metric: AlertMetric,
    days: number,
    signal?: AbortSignal,
  ): Promise<Heatmap> =>
    apiRequest(
      `/api/devices/${encodeURIComponent(deviceId)}/heatmap?metric=${metric}&days=${days}`,
      HeatmapSchema,
      { signal, timeoutMs: 15_000 },
    ),

  history: (
    deviceId: string,
    metric: HistoryMetric,
    range: HistoryRange,
    signal?: AbortSignal,
  ): Promise<History> =>
    apiRequest(
      `/api/devices/${encodeURIComponent(deviceId)}/history?metric=${metric}&range=${range}`,
      HistorySchema,
      { signal, timeoutMs: 15_000 }, // 30 days aggregates more rows
    ),

  thresholds: (deviceId: string, signal?: AbortSignal): Promise<Thresholds> =>
    apiRequest(`/api/devices/${encodeURIComponent(deviceId)}/thresholds`, ThresholdsSchema, {
      signal,
    }),

  /** 202 = sent to the device, not yet confirmed (confirmation arrives in telemetry). */
  setFanMode: (deviceId: string, body: FanCommand): Promise<FanCommandResponse> =>
    apiRequest(`/api/devices/${encodeURIComponent(deviceId)}/fan`, FanCommandResponseSchema, {
      method: 'POST',
      body: FanCommandSchema.parse(body),
    }),

  /**
   * The greenhouse stores its *current* soil reading as the dry (sensor in air) or
   * wet (sensor in water) point. 202 = sent; the new soilDryMv/soilWetMv in telemetry confirm it.
   */
  calibrateSoil: (deviceId: string, point: SoilPoint): Promise<SoilCalibrationResponse> =>
    apiRequest(
      `/api/devices/${encodeURIComponent(deviceId)}/soil-calibration`,
      SoilCalibrationResponseSchema,
      { method: 'POST', body: SoilCalibrationBodySchema.parse({ point }) },
    ),

  // ---------- Alerts ----------

  alerts: (
    filter: AlertsFilter,
    cursor: string | null,
    opts: { limit?: number; signal?: AbortSignal } = {},
  ): Promise<AlertPage> => {
    const params = new URLSearchParams({ limit: String(opts.limit ?? 30) });
    if (filter.severity?.length) params.set('severity', filter.severity.join(','));
    if (filter.unread !== undefined) params.set('unread', String(filter.unread));
    if (cursor) params.set('cursor', cursor);
    return apiRequest(`/api/alerts?${params.toString()}`, AlertPageSchema, {
      signal: opts.signal,
    });
  },

  markAlertRead: (id: number): Promise<Alert> =>
    apiRequest(`/api/alerts/${id}/read`, AlertSchema, { method: 'POST' }),

  markAllAlertsRead: (): Promise<ReadAllResponse> =>
    apiRequest('/api/alerts/read-all', ReadAllResponseSchema, { method: 'POST' }),

  // ---------- Dev-only Demo tools (backend DEV_TOOLS=true; 404 otherwise) ----------

  devStatus: (signal?: AbortSignal): Promise<DevStatus> =>
    apiRequest('/api/dev/status', DevStatusSchema, { signal }),

  /** Runs a scenario on the simulator only (409 NOT_SIMULATED for real hardware). */
  simulate: (deviceId: string, scenario: SimScenario): Promise<SimulateResponse> =>
    apiRequest('/api/dev/simulate', SimulateResponseSchema, {
      method: 'POST',
      body: { deviceId, scenario },
    }),

  // ---------- SMS alerts to the owner ----------

  smsSettings: (signal?: AbortSignal): Promise<SmsSettings> =>
    apiRequest('/api/sms/settings', SmsSettingsSchema, { signal }),

  updateSmsSettings: (body: SmsSettingsUpdate): Promise<SmsSettings> =>
    apiRequest('/api/sms/settings', SmsSettingsSchema, {
      method: 'PUT',
      body: SmsSettingsUpdateSchema.parse(body),
    }),

  /** One test message to the saved number (409 without a number, 429 after 5 in an hour). */
  sendTestSms: (): Promise<SmsTestResult> =>
    apiRequest('/api/sms/test', SmsTestResultSchema, {
      method: 'POST',
      timeoutMs: 15_000, // the backend waits for the SMS provider
    }),

  // ---------- Push notifications ----------

  registerPushToken: (token: string): Promise<PushToken> =>
    apiRequest('/api/push-tokens', PushTokenSchema, {
      method: 'POST',
      body: { token, platform: 'android' },
    }),

  unregisterPushToken: (token: string, baseUrl?: string): Promise<undefined> =>
    apiRequest(`/api/push-tokens/${encodeURIComponent(token)}`, z.undefined(), {
      method: 'DELETE',
      baseUrl,
    }),

  notificationSettings: (signal?: AbortSignal): Promise<NotificationSettings> =>
    apiRequest('/api/notifications/settings', NotificationSettingsSchema, { signal }),

  updateNotificationSettings: (body: NotificationSettingsUpdate): Promise<NotificationSettings> =>
    apiRequest('/api/notifications/settings', NotificationSettingsSchema, {
      method: 'PUT',
      body: NotificationSettingsUpdateSchema.parse(body),
    }),

  /** `demo` = the prototype's sample alert (title "Greenhouse alert"), used by the dev-only Demo sheet. */
  sendTestPush: (preset?: 'demo'): Promise<PushTestResult> =>
    apiRequest('/api/notifications/test', PushTestResultSchema, {
      method: 'POST',
      body: preset ? { preset } : undefined,
      timeoutMs: 15_000, // the backend waits for Expo's push service
    }),

  updateThresholds: (deviceId: string, body: ThresholdsUpdate): Promise<ThresholdsUpdateResponse> =>
    apiRequest(
      `/api/devices/${encodeURIComponent(deviceId)}/thresholds`,
      ThresholdsUpdateResponseSchema,
      { method: 'PUT', body: ThresholdsUpdateSchema.parse(body) },
    ),
};
