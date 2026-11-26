// Dev-only ESP32 simulator. Sends readings exactly like the firmware
// (POST /api/readings with the X-Device-Key header, docs/api-contract.md §4) and
// applies the commands that come back in the response: soil calibration, and the
// scenarios of the app's dev-only Demo sheet (backend DEV_TOOLS=true).
//
//   npm run sim                          gh-01 → http://localhost:4000, every 30 s
//   npm run sim -- --interval 5          a reading every 5 s (snappier demos)
//   npm run sim -- --hot                 force high temperature (alerts)
//   npm run sim -- --dry                 soil dries fast, no watering (alerts)
//   npm run sim -- --stall-after 60      stop sending after 60 s (offline test)
//   npm run sim -- --url https://<your-service>.onrender.com --device gh-02
//
// The device key is DEVICE_API_KEY from backend/.env, or --key.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { DeviceCommandSchema, DeviceIdSchema, type DeviceCommand } from '../src/domain/schemas.js';
import type { SimScenario } from '../src/dev/scenarios.js';

// backend/.env for the defaults (without the backend's full config: the
// simulator needs no database and may target a remote backend).
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

// ---------- CLI ----------

const HELP = `Usage: npm run sim -- [options]
  --device <id>        device id (default gh-01)
  --interval <sec>     seconds between readings, 1-3600 (default 30, like the firmware)
  --hot                force high temperature
  --dry                fast-drying soil, no watering
  --stall-after <sec>  stop sending after <sec> (the backend marks it offline)
  --url <base-url>     backend (default http://localhost:<PORT from .env or 4000>)
  --key <key>          device key (default DEVICE_API_KEY from backend/.env)
  -h, --help`;

const { values: raw } = parseArgs({
  options: {
    device: { type: 'string', default: 'gh-01' },
    interval: { type: 'string', default: '30' },
    hot: { type: 'boolean', default: false },
    dry: { type: 'boolean', default: false },
    'stall-after': { type: 'string' },
    url: { type: 'string' },
    key: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (raw.help) {
  console.log(HELP);
  process.exit(0);
}

const OptionsSchema = z.object({
  device: DeviceIdSchema,
  interval: z.coerce.number().int().min(1).max(3600),
  hot: z.boolean(),
  dry: z.boolean(),
  stallAfter: z.coerce.number().positive().optional(),
  url: z.url({ protocol: /^https?$/ }).transform((u) => u.replace(/\/+$/, '')),
  key: z.string({ error: 'missing: set DEVICE_API_KEY in backend/.env or pass --key' }).min(1),
});

const parsedOpts = OptionsSchema.safeParse({
  device: raw.device,
  interval: raw.interval,
  hot: raw.hot,
  dry: raw.dry,
  stallAfter: raw['stall-after'],
  url: raw.url ?? `http://localhost:${process.env.PORT ?? '4000'}`,
  key: raw.key ?? process.env.DEVICE_API_KEY,
});
if (!parsedOpts.success) {
  console.error(`Invalid options:\n${z.prettifyError(parsedOpts.error)}\n\n${HELP}`);
  process.exit(1);
}
const opts = parsedOpts.data;

// ---------- Simulation model ----------

// soilRaw is the sensor output in millivolts, like the firmware (analogReadMilliVolts).
const SOIL_RAW_DRY = 2600; // mV in dry air (calibration "dry", 0 %)
const SOIL_RAW_WET = 1200; // mV in water (calibration "wet", 100 %)

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const noise = (amp: number) => (Math.random() * 2 - 1) * amp;
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
/** First-order approach of `current` toward `target` with time constant `tauSec`. */
const approach = (current: number, target: number, dtSec: number, tauSec: number) =>
  current + (target - current) * (1 - Math.exp(-dtSec / tauSec));

function hourOfDay(d = new Date()): number {
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}
/** 0 at night, 1 at solar noon (sunrise 06:00, sunset 20:00). */
function daylight(h: number): number {
  return Math.max(0, Math.sin((Math.PI * (h - 6)) / 14));
}
/** Outside temperature: min ≈16 °C at 03:00, max ≈28 °C at 15:00. */
function outsideTemp(h: number): number {
  return 22 + 6 * Math.sin((2 * Math.PI * (h - 9)) / 24);
}

const sim = {
  /** Forced scenarios: start from the CLI flags, change at runtime via the Demo sheet. */
  hot: opts.hot,
  dry: opts.dry,
  airTemp: 0,
  humidity: 0,
  soilMoisture: opts.dry ? 26 : 62,
  lux: 0,
  rssi: -58,
  cloud: 0.9,
  // Soil calibration reported back (like the firmware's NVS values); the
  // simulation itself uses SOIL_RAW_DRY/WET.
  soilDryMv: SOIL_RAW_DRY,
  soilWetMv: SOIL_RAW_WET,
};

function targetAirTemp(h: number): number {
  if (sim.hot) return 40; // past the critical point (>= 38 °C with the default 35 °C limit)
  return outsideTemp(h) + 6 * daylight(h) * sim.cloud;
}

// Start near equilibrium so the first readings are realistic.
{
  const h = hourOfDay();
  // --hot starts just below the default airTempMax (35 °C) so alerts show up quickly.
  sim.airTemp = sim.hot ? 34 : targetAirTemp(h);
  sim.humidity = clamp(90 - (sim.airTemp - 16) * 2.2, 25, 98);
  sim.lux = daylight(h) * 35_000 * sim.cloud;
}

function step(dt: number): void {
  const h = hourOfDay();
  sim.cloud = clamp(sim.cloud + noise(0.05), 0.4, 1);
  sim.lux =
    daylight(h) > 0 ? daylight(h) * 35_000 * sim.cloud * (1 + noise(0.02)) : Math.random() * 3;

  // --hot heats fast (τ = 60 s): above the 35 °C limit within a reading or two.
  sim.airTemp = approach(sim.airTemp, targetAirTemp(h), dt, sim.hot ? 60 : 600) + noise(0.05);

  const rhTarget = clamp(90 - (sim.airTemp - 16) * 2.2, 25, 98);
  sim.humidity = clamp(approach(sim.humidity, rhTarget, dt, 300) + noise(0.3), 0, 100);

  // Soil dries faster when warm; --dry makes it ~40 %/h for quick alerts.
  const dryPerHour = (sim.dry ? 40 : 1.2) + Math.max(0, sim.airTemp - 20) * 0.15;
  sim.soilMoisture = Math.max(5, sim.soilMoisture - (dryPerHour * dt) / 3600);
  const randomWatering = sim.soilMoisture < 55 && Math.random() < dt / (3 * 3600);
  if (!sim.dry && (sim.soilMoisture < 32 || randomWatering)) {
    const before = sim.soilMoisture;
    sim.soilMoisture = Math.min(85, sim.soilMoisture + 25 + Math.random() * 10);
    console.log(`💧 watering: soil ${before.toFixed(0)}% → ${sim.soilMoisture.toFixed(0)}%`);
  }

  sim.rssi = clamp(sim.rssi + noise(1.5), -78, -45);
}

const startedAt = Date.now();

function readingBody() {
  const soilRaw = Math.round(
    SOIL_RAW_DRY - (sim.soilMoisture / 100) * (SOIL_RAW_DRY - SOIL_RAW_WET) + noise(8),
  );
  return {
    deviceId: opts.device,
    ts: Date.now(),
    intervalSec: opts.interval,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    // Dev-only marker: lets the backend's Demo tools tell this from real hardware.
    simulator: true,
    temperature: round(sim.airTemp, 1),
    humidity: round(sim.humidity, 1),
    soilMoisture: round(sim.soilMoisture, 1),
    soilRaw,
    lux: round(sim.lux, 1),
    rssi: Math.round(sim.rssi),
    soilDryMv: sim.soilDryMv,
    soilWetMv: sim.soilWetMv,
  };
}

// ---------- HTTP ----------

/** A sleeping Render service holds the first request while it starts (~1 min). */
const REQUEST_TIMEOUT_MS = 75_000;
/** Same rule as the firmware: commands older than this are ignored. */
const MAX_COMMAND_AGE_MS = 150_000;

const ResponseSchema = z.object({ commands: z.array(z.unknown()).default([]) });

let stalled = false;
let stopping = false;

async function sendReading(reason = ''): Promise<void> {
  if (stalled || stopping) return;
  const body = readingBody();
  let res: Response;
  try {
    res = await fetch(`${opts.url}/api/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Key': opts.key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`cannot reach ${opts.url}: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (res.status === 401) {
    console.error('401: the backend rejected the device key (DEVICE_API_KEY / --key)');
    return;
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return;
  }
  const time = new Date().toLocaleTimeString();
  console.log(
    `${time} ${opts.device} T=${body.temperature}°C RH=${body.humidity}% soil=${body.soilMoisture}% ` +
      `lux=${body.lux}` +
      (reason ? `  ← ${reason}` : ''),
  );
  const parsed = ResponseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return;
  for (const raw of parsed.data.commands) {
    const cmd = DeviceCommandSchema.safeParse(raw);
    if (cmd.success) await handleCommand(cmd.data);
    else console.warn(`ignored invalid command: ${JSON.stringify(raw).slice(0, 120)}`);
  }
}

async function handleCommand(cmd: DeviceCommand): Promise<void> {
  const ageMs = Date.now() - Date.parse(cmd.issuedAt);
  if (ageMs > MAX_COMMAND_AGE_MS) {
    console.warn(`ignored stale ${cmd.type} (${Math.round(ageMs / 1000)} s old)`);
    return;
  }
  if (cmd.type === 'calibrateSoil') {
    // Like the firmware: the current raw reading becomes the dry (0 %) / wet (100 %) point.
    const raw = readingBody().soilRaw;
    if (cmd.point === 'dry') sim.soilDryMv = raw;
    else sim.soilWetMv = raw;
    // Report right away so the app confirms quickly.
    await sendReading(`calibrateSoil ${cmd.point} = ${raw} mV`);
    return;
  }
  applyScenario(cmd.scenario);
  await sendReading(`scenario ${cmd.scenario}`);
}

/** Demo sheet scenarios (backend DEV_TOOLS=true → POST /api/dev/simulate). */
function applyScenario(scenario: SimScenario): void {
  if (scenario === 'heatwave') {
    sim.hot = true;
    sim.airTemp = Math.max(sim.airTemp, 35.5); // above the default 35 °C limit at once
  } else if (scenario === 'drysoil') {
    sim.dry = true;
    sim.soilMoisture = Math.min(sim.soilMoisture, 27); // below the default 30 % limit
  } else {
    sim.hot = false;
    sim.dry = false;
    sim.airTemp = Math.min(sim.airTemp, 27); // back to comfortable
    sim.soilMoisture = Math.max(sim.soilMoisture, 60);
  }
}

/** One reading per interval; the next is scheduled after the previous finished. Ctrl+C ends it. */
async function loop(): Promise<void> {
  await sendReading('start');
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, opts.interval * 1000));
    step(opts.interval);
    await sendReading();
  }
}

if (opts.stallAfter !== undefined) {
  setTimeout(() => {
    stalled = true;
    console.log(
      `⏸  stalled: no more readings. The backend marks ${opts.device} offline after ~${3 * opts.interval + 2} s.`,
    );
  }, opts.stallAfter * 1000);
}

process.on('SIGINT', () => {
  if (stopping) process.exit(1);
  stopping = true;
  console.log('stopped (the backend marks the device offline after 3 missed readings)');
  process.exit(0);
});

console.log(
  `simulator ${opts.device} → ${opts.url} every ${opts.interval} s ` +
    `${sim.hot ? 'HOT ' : ''}${sim.dry ? 'DRY ' : ''}— Ctrl+C to stop`,
);
void loop();
