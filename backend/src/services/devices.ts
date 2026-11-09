import { prisma } from '../db.js';
import type { Device } from '../generated/prisma/client.js';
import { ApiError } from '../http/errors.js';

/** Diagnostics the device reports in telemetry (stored on the Device row). */
export interface DeviceReport {
  rssi?: number | null;
  uptimeSec?: number;
  soilDryMv?: number;
  soilWetMv?: number;
}

export interface PresenceResult {
  device: Device;
  /** true when `online` flipped (or the device was just created). */
  changed: boolean;
  /** true when the device was auto-registered by this call. */
  created: boolean;
  /** true when a live message had been received from the device before this call. */
  seenBefore: boolean;
  /** true when the reported soil calibration differs from the stored one (acknowledgement). */
  calibrationChanged: boolean;
}

/** Prisma data for the reported fields that are present (undefined = not reported). */
function reportData(report: DeviceReport | undefined, at: Date | null) {
  if (!report) return {};
  return {
    ...(report.rssi !== undefined ? { rssi: report.rssi } : {}),
    ...(report.uptimeSec !== undefined && at ? { uptimeSec: report.uptimeSec, uptimeAt: at } : {}),
    ...(report.soilDryMv !== undefined ? { soilDryMv: report.soilDryMv } : {}),
    ...(report.soilWetMv !== undefined ? { soilWetMv: report.soilWetMv } : {}),
  };
}

/**
 * Create the device if unknown (auto-registration, with default thresholds),
 * then set its online flag and, when given, its lastSeen time, telemetry interval
 * and reported diagnostics (RSSI, uptime, soil calibration) in the same write.
 */
export async function setPresence(
  id: string,
  online: boolean,
  seenAt: Date | null,
  intervalSec?: number,
  report?: DeviceReport,
): Promise<PresenceResult> {
  const existing = await prisma.device.findUnique({ where: { id } });
  if (!existing) {
    const device = await prisma.device.create({
      data: {
        id,
        name: id,
        online,
        lastSeen: seenAt,
        telemetryIntervalSec: intervalSec ?? null,
        ...reportData(report, seenAt),
        thresholds: { create: {} },
      },
    });
    return { device, changed: true, created: true, seenBefore: false, calibrationChanged: false };
  }
  const device = await prisma.device.update({
    where: { id },
    data: {
      online,
      ...(seenAt ? { lastSeen: seenAt } : {}),
      ...(intervalSec !== undefined ? { telemetryIntervalSec: intervalSec } : {}),
      ...reportData(report, seenAt),
    },
  });
  return {
    device,
    changed: existing.online !== online,
    created: false,
    seenBefore: existing.lastSeen !== null,
    calibrationChanged:
      existing.soilDryMv !== device.soilDryMv || existing.soilWetMv !== device.soilWetMv,
  };
}

/**
 * Records the fan thresholds the device reports using. Returns the updated
 * device only when the values changed (so callers emit device:status once).
 */
export async function updateReportedFanThresholds(
  device: Device,
  fanOnTemp: number,
  fanOffTemp: number,
  at: Date,
): Promise<Device | null> {
  if (device.reportedFanOnTemp === fanOnTemp && device.reportedFanOffTemp === fanOffTemp) {
    return null;
  }
  return prisma.device.update({
    where: { id: device.id },
    data: {
      reportedFanOnTemp: fanOnTemp,
      reportedFanOffTemp: fanOffTemp,
      reportedFanThresholdsAt: at,
    },
  });
}

/** Renames a device. The id (MQTT topic) never changes. */
export function renameDevice(id: string, name: string): Promise<Device> {
  return prisma.device.update({ where: { id }, data: { name } });
}

export function getDevice(id: string): Promise<Device | null> {
  return prisma.device.findUnique({ where: { id } });
}

export function listDevices(): Promise<Device[]> {
  return prisma.device.findMany({ orderBy: { id: 'asc' } });
}

export async function getDeviceOr404(id: string): Promise<Device> {
  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) throw new ApiError(404, 'NOT_FOUND', `Device "${id}" not found`);
  return device;
}

/** Extra slack on top of 3 intervals for network/broker jitter. */
const OFFLINE_GRACE_MS = 2_000;

/** How long a device may stay silent before it is considered offline. */
export function offlineAfterMs(device: Device, fallbackSec: number): number {
  return device.telemetryIntervalSec
    ? 3 * device.telemetryIntervalSec * 1000 + OFFLINE_GRACE_MS
    : fallbackSec * 1000;
}

/**
 * Marks online devices offline when silent for 3 telemetry intervals (or
 * `fallbackSec` if the interval is unknown). Silence is only counted since
 * `listeningSince` (last MQTT connect): while the backend was down or the broker
 * unreachable it could not have received anything. Returns the devices that flipped.
 */
export async function markStaleDevicesOffline(
  now: Date,
  fallbackSec: number,
  listeningSince: Date,
): Promise<Device[]> {
  const online = await prisma.device.findMany({ where: { online: true } });
  const flipped: Device[] = [];
  for (const d of online) {
    const since = Math.max(d.lastSeen?.getTime() ?? 0, listeningSince.getTime());
    const silentMs = now.getTime() - since;
    if (silentMs <= offlineAfterMs(d, fallbackSec)) continue;
    // Conditional update: skip if a message arrived meanwhile (lastSeen changed).
    const { count } = await prisma.device.updateMany({
      where: { id: d.id, online: true, lastSeen: d.lastSeen },
      data: { online: false },
    });
    if (count === 1) flipped.push({ ...d, online: false });
  }
  return flipped;
}
