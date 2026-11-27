// Dev-only ESP32 simulator. Behaves like the firmware (docs/api-contract.md §4):
// - MQTT (when MQTT_URL is set): telemetry on greenhouse/{id}/telemetry, retained
//   "online" on greenhouse/{id}/status with the Last Will "offline", commands from
//   greenhouse/{id}/command; while the broker is unreachable it falls back to HTTPS.
// - HTTPS: POST /api/readings with X-Device-Key; commands come back in the response.
// Commands: soil calibration, and the scenarios of the app's dev-only Demo sheet
// (backend DEV_TOOLS=true).
//
//   npm run sim                          gh-01 every 30 s (MQTT if MQTT_URL is set, else HTTPS)
//   npm run sim -- --transport http      HTTPS only
//   npm run sim -- --interval 5          a reading every 5 s (snappier demos)
//   npm run sim -- --hot                 force high temperature (alerts)
//   npm run sim -- --dry                 soil dries fast, no watering (alerts)
//   npm run sim -- --stall-after 60      stop sending after 60 s (offline test)
//   npm run sim -- --url https://<your-service>.onrender.com --device gh-02
//
// The device key is DEVICE_API_KEY from backend/.env, or --key. The broker login is
// --mqtt-user / --mqtt-pass, or MQTT_USERNAME / MQTT_PASSWORD from backend/.env.
// Ctrl+C drops the MQTT connection without a goodbye, so the broker sends the Last Will.
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { connect, type MqttClient } from 'mqtt';
import { z } from 'zod';
import { DeviceCommandSchema, DeviceIdSchema, type DeviceCommand } from '../src/domain/schemas.js';
import type { SimScenario } from '../src/dev/scenarios.js';
import { errorText } from '../src/mqtt/client.js';

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
  --transport <t>      mqtt or http (default mqtt when MQTT_URL is set)
  --mqtt-url <url>     broker (default MQTT_URL from backend/.env)
  --mqtt-user <name>   broker login (default MQTT_USERNAME)
  --mqtt-pass <pass>   broker password (default MQTT_PASSWORD)
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
    transport: { type: 'string' },
    'mqtt-url': { type: 'string' },
    'mqtt-user': { type: 'string' },
    'mqtt-pass': { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (raw.help) {
  console.log(HELP);
  process.exit(0);
}

function blank(v: string | undefined): boolean {
  return v === undefined || v.trim() === '';
}
function nonBlank(v: string | undefined): string | undefined {
  return blank(v) ? undefined : v?.trim();
}

const OptionsSchema = z.object({
  device: DeviceIdSchema,
  interval: z.coerce.number().int().min(1).max(3600),
  hot: z.boolean(),
  dry: z.boolean(),
  stallAfter: z.coerce.number().positive().optional(),
  url: z.url({ protocol: /^https?$/ }).transform((u) => u.replace(/\/+$/, '')),
  key: z.string({ error: 'missing: set DEVICE_API_KEY in backend/.env or pass --key' }).min(1),
  transport: z.enum(['mqtt', 'http']),
  mqttUrl: z
    .string()
    .regex(/^(mqtts?|wss?):\/\//, 'must be like mqtts://host:8883')
    .optional(),
  mqttUser: z.string().min(1).optional(),
  mqttPass: z.string().min(1).optional(),
});

const parsedOpts = OptionsSchema.safeParse({
  device: raw.device,
  interval: raw.interval,
  hot: raw.hot,
  dry: raw.dry,
  stallAfter: raw['stall-after'],
  url: raw.url ?? `http://localhost:${process.env.PORT ?? '4000'}`,
  key: raw.key ?? process.env.DEVICE_API_KEY,
  transport: raw.transport ?? (blank(raw['mqtt-url'] ?? process.env.MQTT_URL) ? 'http' : 'mqtt'),
  mqttUrl: nonBlank(raw['mqtt-url'] ?? process.env.MQTT_URL),
  mqttUser: nonBlank(raw['mqtt-user'] ?? process.env.MQTT_USERNAME),
  mqttPass: nonBlank(raw['mqtt-pass'] ?? process.env.MQTT_PASSWORD),
});
if (!parsedOpts.success) {
  console.error(`Invalid options:\n${z.prettifyError(parsedOpts.error)}\n\n${HELP}`);
  process.exit(1);
}
const opts = parsedOpts.data;
if (opts.transport === 'mqtt' && !opts.mqttUrl) {
  console.error('--transport mqtt needs a broker: set MQTT_URL in backend/.env or pass --mqtt-url');
  process.exit(1);
}

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

// ---------- MQTT ----------

const topic = {
  telemetry: `greenhouse/${opts.device}/telemetry`,
  status: `greenhouse/${opts.device}/status`,
  command: `greenhouse/${opts.device}/command`,
};

let mqtt: MqttClient | null = null;

function startMqtt(url: string): MqttClient {
  const client = connect(url, {
    clientId: `${opts.device}-sim-${randomUUID().slice(0, 6)}`,
    ...(opts.mqttUser !== undefined ? { username: opts.mqttUser } : {}),
    ...(opts.mqttPass !== undefined ? { password: opts.mqttPass } : {}),
    protocolVersion: 4,
    clean: true,
    keepalive: 15,
    reconnectPeriod: 5_000,
    reconnectOnConnackError: true,
    connectTimeout: 15_000,
    // The broker publishes this (retained) when the connection dies without a goodbye.
    will: { topic: topic.status, payload: Buffer.from('offline'), qos: 1, retain: true },
  });
  let lastError = '';
  let up = false;
  client.on('connect', () => {
    lastError = '';
    up = true;
    console.log(`MQTT connected to ${new URL(url).host}`);
    client.publish(topic.status, 'online', { qos: 1, retain: true });
    client.subscribe(topic.command, { qos: 1 });
  });
  client.on('close', () => {
    // Once per outage, not on every failed retry.
    if (up && !stopping) console.warn('MQTT disconnected: readings go over HTTPS until it is back');
    up = false;
  });
  client.on('error', (err) => {
    const text = errorText(err);
    if (text !== lastError) console.error(`MQTT: ${text}`);
    lastError = text;
  });
  client.on('message', (_topic, payload) => {
    let json: unknown;
    try {
      json = JSON.parse(payload.toString('utf8')) as unknown;
    } catch {
      json = null;
    }
    const cmd = DeviceCommandSchema.safeParse(json);
    if (cmd.success) void handleCommand(cmd.data);
    else console.warn(`ignored invalid command: ${payload.toString('utf8').slice(0, 120)}`);
  });
  return client;
}

/** True if the reading went out over MQTT (QoS 1: the broker acknowledged it). */
async function publishReading(body: ReturnType<typeof readingBody>): Promise<boolean> {
  if (!mqtt?.connected) return false;
  try {
    await mqtt.publishAsync(topic.telemetry, JSON.stringify(body), { qos: 1 });
    return true;
  } catch (err) {
    console.warn(`MQTT publish failed (${err instanceof Error ? err.message : String(err)})`);
    return false;
  }
}

/** Like the firmware: GET /health every 10 min so a sleeping Render service wakes up. */
const KEEP_AWAKE_MS = 10 * 60_000;
async function keepAwake(): Promise<void> {
  try {
    const res = await fetch(`${opts.url}/health`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) console.warn(`keep-awake ping: HTTP ${res.status}`);
  } catch (err) {
    console.warn(`keep-awake ping failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------- HTTP ----------

/** A sleeping Render service holds the first request while it starts (~1 min). */
const REQUEST_TIMEOUT_MS = 75_000;
/** Same rule as the firmware: commands older than this are ignored. */
const MAX_COMMAND_AGE_MS = 150_000;

const ResponseSchema = z.object({ commands: z.array(z.unknown()).default([]) });

let stalled = false;
let stopping = false;

function logReading(body: ReturnType<typeof readingBody>, via: string, reason: string): void {
  const time = new Date().toLocaleTimeString();
  console.log(
    `${time} ${opts.device} [${via}] T=${body.temperature}°C RH=${body.humidity}% ` +
      `soil=${body.soilMoisture}% lux=${body.lux}` +
      (reason ? `  ← ${reason}` : ''),
  );
}

async function sendReading(reason = ''): Promise<void> {
  if (stalled || stopping) return;
  const body = readingBody();
  if (await publishReading(body)) {
    logReading(body, 'MQTT', reason);
    return; // commands arrive on the command topic
  }
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
  logReading(body, mqtt ? 'HTTPS fallback' : 'HTTPS', reason);
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
  if (opts.transport === 'mqtt' && opts.mqttUrl) {
    const client = startMqtt(opts.mqttUrl);
    mqtt = client;
    // Give the first connection a moment so the first reading can use it.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 10_000);
      client.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    setInterval(() => void keepAwake(), KEEP_AWAKE_MS).unref();
  }
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
  console.log(
    mqtt
      ? 'stopped without an MQTT goodbye: the broker publishes the Last Will "offline"'
      : 'stopped (the backend marks the device offline after 3 missed readings)',
  );
  // Destroy the socket instead of a clean DISCONNECT, like a power cut (Last Will).
  mqtt?.stream.destroy();
  process.exit(0);
});

const target =
  opts.transport === 'mqtt' && opts.mqttUrl
    ? `MQTT ${new URL(opts.mqttUrl).host} (HTTPS fallback ${opts.url})`
    : opts.url;
console.log(
  `simulator ${opts.device} → ${target} every ${opts.interval} s ` +
    `${sim.hot ? 'HOT ' : ''}${sim.dry ? 'DRY ' : ''}— Ctrl+C to stop`,
);
void loop();
