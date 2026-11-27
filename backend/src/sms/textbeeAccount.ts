import { z } from 'zod';
import { TEXTBEE_BASE, TEXTBEE_USER_AGENT } from './textbee.js';

/** GET /gateway/stats (documented): proves the key works. */
const StatsSchema = z.object({
  data: z.object({
    totalSentSMSCount: z.number().optional(),
    totalDeviceCount: z.number().optional(),
  }),
});

/** GET /gateway/devices (documented DeviceDTO). Only the fields used here; extras are ignored. */
const DeviceSchema = z.object({
  _id: z.string(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  name: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  lastHeartbeat: z.string().nullish(),
  receiveSMSEnabled: z.boolean().optional(),
  batteryInfo: z
    .object({ percentage: z.number().optional(), isCharging: z.boolean().optional() })
    .nullish(),
  powerInfo: z
    .object({
      isIgnoringBatteryOptimizations: z.boolean().optional(),
      isPowerSaveMode: z.boolean().optional(),
    })
    .nullish(),
  simInfo: z
    .object({
      sims: z
        .array(
          z.object({
            simSlotIndex: z.number().optional(),
            carrierName: z.string().optional(),
            serviceState: z.string().optional(),
          }),
        )
        .optional(),
    })
    .nullish(),
});
const DevicesSchema = z.object({ data: z.array(DeviceSchema) });
type Device = z.infer<typeof DeviceSchema>;

/** textbee's docs: the app sends a heartbeat every 30 min by default; "under 45 minutes" is healthy. */
export const HEARTBEAT_STALE_MS = 45 * 60_000;

export interface TextbeeCheck {
  ok: boolean;
  /** Plain-language lines for the owner: what works, what to fix. */
  lines: { level: 'ok' | 'warn' | 'error'; text: string }[];
}

interface Options {
  apiKey: string;
  /** TEXTBEE_DEVICE_ID from .env, if any. */
  deviceId?: string | undefined;
  /** TEXTBEE_SIM_SLOT from .env, if any (0 = SIM 1). */
  simSlot?: number | undefined;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Injected in tests. */
  now?: number;
}

const label = (d: Device) =>
  d.name ?? ([d.brand, d.model].filter(Boolean).join(' ') || `phone ${d._id}`);

function ago(ms: number): string {
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
}

/**
 * Read-only setup check: is the API key accepted, is the phone linked, enabled and
 * awake, does it have signal. Sends NO SMS and costs nothing (2 GET requests).
 */
export async function checkTextbeeAccount(opts: Options): Promise<TextbeeCheck> {
  const { apiKey, deviceId, simSlot, fetchFn = fetch, timeoutMs = 10_000 } = opts;
  const now = opts.now ?? Date.now();
  const lines: TextbeeCheck['lines'] = [];
  const redact = (text: string) => text.split(apiKey).join('***').slice(0, 200);
  const done = (): TextbeeCheck => ({ ok: !lines.some((l) => l.level === 'error'), lines });

  async function get(path: string): Promise<{ status: number; body: unknown; raw: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const res = await fetchFn(`${TEXTBEE_BASE}${path}`, {
        headers: { 'x-api-key': apiKey, 'User-Agent': TEXTBEE_USER_AGENT },
        signal: controller.signal,
      });
      const raw = await res.text();
      let body: unknown = null;
      try {
        body = JSON.parse(raw) as unknown;
      } catch {
        /* not JSON: handled by the callers */
      }
      return { status: res.status, body, raw };
    } finally {
      clearTimeout(timer);
    }
  }

  // 1. The key.
  try {
    const res = await get('/gateway/stats');
    const stats = StatsSchema.safeParse(res.body);
    if (res.status < 200 || res.status >= 300 || !stats.success) {
      lines.push({
        level: 'error',
        text: `textbee did not accept the API key (HTTP ${res.status}): ${redact(res.raw)}. Check TEXTBEE_API_KEY.`,
      });
      return done();
    }
    lines.push({
      level: 'ok',
      text: `API key accepted (${stats.data.data.totalSentSMSCount ?? 0} SMS sent with this account so far).`,
    });
  } catch {
    lines.push({
      level: 'error',
      text: 'Could not reach textbee (check this computer’s internet connection).',
    });
    return done();
  }

  // 2. The phone.
  let devices: Device[];
  try {
    const res = await get('/gateway/devices');
    const parsed = DevicesSchema.safeParse(res.body);
    if (res.status < 200 || res.status >= 300 || !parsed.success) {
      lines.push({
        level: 'error',
        text: `Could not read the linked phones (HTTP ${res.status}): ${redact(res.raw)}.`,
      });
      return done();
    }
    devices = parsed.data.data;
  } catch {
    lines.push({
      level: 'error',
      text: 'Could not read the linked phones (no answer from textbee).',
    });
    return done();
  }

  if (devices.length === 0) {
    lines.push({
      level: 'error',
      text: 'No phone is linked. Install the textbee app on the Android phone and scan the QR code from the dashboard.',
    });
    return done();
  }
  let device: Device | undefined;
  if (deviceId) {
    device = devices.find((d) => d._id === deviceId);
    if (!device) {
      lines.push({
        level: 'error',
        text: `TEXTBEE_DEVICE_ID is not one of your phones (${devices.map((d) => `${label(d)} = ${d._id}`).join(', ')}).`,
      });
      return done();
    }
  } else {
    device = devices.find((d) => d.isDefault) ?? devices.find((d) => d.enabled !== false);
    lines.push({
      level: 'warn',
      text: `TEXTBEE_DEVICE_ID is empty: textbee picks the phone (now probably ${device ? `${label(device)}, id ${device._id}` : 'none'}). Set it to be sure.`,
    });
    if (!device) {
      lines.push({ level: 'error', text: 'No enabled phone: enable it in the textbee dashboard.' });
      return done();
    }
  }

  if (device.enabled === false) {
    lines.push({
      level: 'error',
      text: `${label(device)} is disabled: enable it in the textbee app or dashboard.`,
    });
  } else {
    lines.push({ level: 'ok', text: `Phone: ${label(device)} (enabled).` });
  }

  const beat = device.lastHeartbeat ? Date.parse(device.lastHeartbeat) : Number.NaN;
  if (Number.isNaN(beat)) {
    lines.push({
      level: 'warn',
      text: 'The phone has not reported in yet. Open the textbee app and tap "Send heartbeat".',
    });
  } else if (now - beat > HEARTBEAT_STALE_MS) {
    lines.push({
      level: 'warn',
      text: `Last heard from the phone ${ago(now - beat)}: it may be off, offline or asleep. SMS wait until it wakes.`,
    });
  } else {
    lines.push({ level: 'ok', text: `Phone last reported ${ago(now - beat)}.` });
  }

  const power = device.powerInfo;
  if (power?.isIgnoringBatteryOptimizations === false) {
    lines.push({
      level: 'warn',
      text: 'Battery optimization is on for textbee: set App battery usage to "Unrestricted", or Android may delay SMS.',
    });
  }
  if (power?.isPowerSaveMode) {
    lines.push({ level: 'warn', text: 'Battery saver is on: turn it off for reliable SMS.' });
  }
  const battery = device.batteryInfo;
  if (battery?.percentage !== undefined && battery.percentage < 20 && !battery.isCharging) {
    lines.push({
      level: 'warn',
      text: `Battery at ${battery.percentage}% and not charging: keep the phone plugged in.`,
    });
  }

  const sims = device.simInfo?.sims ?? [];
  const sim =
    simSlot !== undefined
      ? sims.find((s) => s.simSlotIndex === simSlot)
      : sims.length
        ? sims[0]
        : undefined;
  if (simSlot !== undefined && sims.length > 0 && !sim) {
    lines.push({
      level: 'error',
      text: `TEXTBEE_SIM_SLOT=${simSlot} (SIM ${simSlot + 1}) has no SIM card. Slots with a SIM: ${sims.map((s) => s.simSlotIndex ?? '?').join(', ')}.`,
    });
  } else if (sim?.serviceState && sim.serviceState !== 'IN_SERVICE') {
    lines.push({
      level: 'warn',
      text: `SIM${sim.carrierName ? ` (${sim.carrierName})` : ''} has no service (${sim.serviceState}): SMS can't go out until it has signal.`,
    });
  } else if (sim) {
    lines.push({
      level: 'ok',
      text: `SIM${sim.carrierName ? `: ${sim.carrierName}` : ''}${sim.serviceState ? ` (${sim.serviceState})` : ''}. Make sure it has load or an SMS promo.`,
    });
  }

  if (device.receiveSMSEnabled) {
    lines.push({
      level: 'warn',
      text: 'Receiving SMS is on: incoming texts are uploaded to textbee and count toward the free plan (300 per month). Turn it off in the app if you don’t need it.',
    });
  }

  return done();
}
