// Dev-only ESP32 simulator. Publishes on the same MQTT topics as the real
// firmware and obeys the same commands (see docs/api-contract.md §4).
//
//   npm run sim                       normal day/night simulation for gh-01
//   npm run sim -- --hot              force high temperature (alerts, fan ON)
//   npm run sim -- --dry              soil dries fast, no watering (alerts)
//   npm run sim -- --interval 2       telemetry every 2 s
//   npm run sim -- --stall-after 30   stop telemetry after 30 s but stay connected
//   npm run sim -- --crash            Ctrl+C = power cut (broker sends the Last Will)
//   npm run sim -- --device gh-02 --url mqtt://192.168.1.50:1883
//
// While it runs it also listens on greenhouse/<id>/sim for scenarios sent by the
// app's dev-only Demo sheet (backend DEV_TOOLS=true): heatwave | drysoil | normal.
import { parseArgs } from 'node:util';
import { connect } from 'mqtt';
import { z } from 'zod';
import { env } from '../src/config/env.js';
import {
  DeviceCommandSchema,
  DeviceIdSchema,
  type DeviceCommand,
  type FanMode,
} from '../src/domain/schemas.js';
import { SimScenarioSchema, type SimScenario } from '../src/dev/scenarios.js';
import { topics } from '../src/mqtt/topics.js';

// ---------- CLI ----------

const HELP = `Usage: npm run sim -- [options]
  --device <id>        device id (default gh-01)
  --interval <sec>     telemetry interval, 1-3600 (default 5)
  --hot                force high temperature
  --dry                fast-drying soil, no watering
  --stall-after <sec>  stop publishing telemetry after <sec>, stay connected
  --crash              on Ctrl+C drop the connection without goodbye (Last Will fires)
  --url <mqtt-url>     broker (default MQTT_URL from .env)
  -h, --help`;

const { values: raw } = parseArgs({
  options: {
    device: { type: 'string', default: 'gh-01' },
    interval: { type: 'string', default: '5' },
    hot: { type: 'boolean', default: false },
    dry: { type: 'boolean', default: false },
    'stall-after': { type: 'string' },
    crash: { type: 'boolean', default: false },
    url: { type: 'string' },
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
  crash: z.boolean(),
  url: z.string().regex(/^mqtts?:\/\//),
});

const parsedOpts = OptionsSchema.safeParse({
  device: raw.device,
  interval: raw.interval,
  hot: raw.hot,
  dry: raw.dry,
  stallAfter: raw['stall-after'],
  crash: raw.crash,
  url: raw.url ?? env.MQTT_URL,
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
  fanMode: 'auto' as FanMode,
  fanOn: false,
  // Firmware defaults (NVS); the backend pushes its values when we come online.
  fanOnTemp: 32,
  fanOffTemp: 28,
  // Soil calibration reported back (like the firmware's NVS values); the
  // simulation itself uses SOIL_RAW_DRY/WET.
  soilDryMv: SOIL_RAW_DRY,
  soilWetMv: SOIL_RAW_WET,
};

function targetAirTemp(h: number): number {
  if (sim.hot) return 41 - (sim.fanOn ? 1.5 : 0); // the fan can't keep up
  return outsideTemp(h) + 6 * daylight(h) * sim.cloud - (sim.fanOn ? 4 : 0);
}

// Start near equilibrium so the first readings are realistic.
{
  const h = hourOfDay();
  // --hot starts just below the default airTempMax (35 °C) so alerts show up quickly.
  sim.airTemp = sim.hot ? 34 : targetAirTemp(h);
  sim.humidity = clamp(90 - (sim.airTemp - 16) * 2.2, 25, 98);
  sim.lux = daylight(h) * 35_000 * sim.cloud;
  applyFanLogic();
}

/** Same hysteresis as the firmware: ON at >= fanOnTemp, OFF at <= fanOffTemp (auto). */
function applyFanLogic(): void {
  if (sim.fanMode === 'on') sim.fanOn = true;
  else if (sim.fanMode === 'off') sim.fanOn = false;
  else if (sim.airTemp >= sim.fanOnTemp) sim.fanOn = true;
  else if (sim.airTemp <= sim.fanOffTemp) sim.fanOn = false;
}

function step(dt: number): void {
  const h = hourOfDay();
  sim.cloud = clamp(sim.cloud + noise(0.05), 0.4, 1);
  sim.lux =
    daylight(h) > 0 ? daylight(h) * 35_000 * sim.cloud * (1 + noise(0.02)) : Math.random() * 3;

  // --hot heats fast (τ = 60 s): warning (>35 °C) after ~15 s, critical (≥38 °C) after ~80 s.
  sim.airTemp = approach(sim.airTemp, targetAirTemp(h), dt, sim.hot ? 60 : 600) + noise(0.05);

  const rhTarget = clamp(90 - (sim.airTemp - 16) * 2.2 - (sim.fanOn ? 6 : 0), 25, 98);
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
  applyFanLogic();
}

const startedAt = Date.now();

function telemetryPayload() {
  const soilRaw = Math.round(
    SOIL_RAW_DRY - (sim.soilMoisture / 100) * (SOIL_RAW_DRY - SOIL_RAW_WET) + noise(8),
  );
  return {
    ts: Date.now(),
    intervalSec: opts.interval,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    // Dev-only marker: lets the backend's Demo tools tell this from real hardware.
    simulator: true,
    airTemp: round(sim.airTemp, 1),
    humidity: round(sim.humidity, 1),
    soilMoisture: round(sim.soilMoisture, 1),
    soilRaw,
    lux: round(sim.lux, 1),
    fanOn: sim.fanOn,
    fanMode: sim.fanMode,
    rssi: Math.round(sim.rssi),
    // Thresholds in use: acknowledges setFanThresholds (like the firmware's NVS values).
    fanOnTemp: sim.fanOnTemp,
    fanOffTemp: sim.fanOffTemp,
    soilDryMv: sim.soilDryMv,
    soilWetMv: sim.soilWetMv,
  };
}

// ---------- MQTT ----------

const statusTopic = topics.status(opts.device);
const client = connect(opts.url, {
  clientId: `sim-${opts.device}`,
  clean: true,
  keepalive: 15,
  reconnectPeriod: 2000,
  will: { topic: statusTopic, payload: Buffer.from('offline'), qos: 1, retain: true },
});

let stalled = false;
let timer: NodeJS.Timeout | undefined;

function publishTelemetry(reason = ''): void {
  if (stalled || !client.connected) return;
  const p = telemetryPayload();
  client.publish(topics.telemetry(opts.device), JSON.stringify(p), { qos: 0 });
  const time = new Date().toLocaleTimeString();
  console.log(
    `${time} ${opts.device} T=${p.airTemp}°C RH=${p.humidity}% soil=${p.soilMoisture}% ` +
      `lux=${p.lux} fan=${p.fanOn ? 'ON' : 'off'}(${p.fanMode}) on/off=${sim.fanOnTemp}/${sim.fanOffTemp}` +
      (reason ? `  ← ${reason}` : ''),
  );
}

/** Commands delivered late (queued during a broker outage) are ignored (contract §4). */
const MAX_COMMAND_AGE_MS = 30_000;

function handleCommand(cmd: DeviceCommand): void {
  const ageMs = Date.now() - Date.parse(cmd.issuedAt);
  if (ageMs > MAX_COMMAND_AGE_MS) {
    console.warn(`ignored stale ${cmd.type} (${Math.round(ageMs / 1000)} s old)`);
    return;
  }
  if (cmd.type === 'setFanMode') {
    sim.fanMode = cmd.mode;
    applyFanLogic();
    publishTelemetry(`setFanMode ${cmd.mode}`);
  } else if (cmd.type === 'calibrateSoil') {
    // Like the firmware: the current raw reading becomes the dry (0 %) / wet (100 %) point.
    const raw = telemetryPayload().soilRaw;
    if (cmd.point === 'dry') sim.soilDryMv = raw;
    else sim.soilWetMv = raw;
    publishTelemetry(`calibrateSoil ${cmd.point} = ${raw} mV`);
  } else {
    sim.fanOnTemp = cmd.fanOnTemp;
    sim.fanOffTemp = cmd.fanOffTemp;
    applyFanLogic();
    publishTelemetry(`setFanThresholds ${cmd.fanOnTemp}/${cmd.fanOffTemp}`);
  }
}

/** Demo sheet scenarios (backend DEV_TOOLS=true → POST /api/dev/simulate → this topic). */
function handleScenario(scenario: SimScenario): void {
  if (scenario === 'heatwave') {
    sim.hot = true;
    sim.airTemp = Math.max(sim.airTemp, 33.1); // already past the fan-ON point, critical (>= 38) within ~30 s
  } else if (scenario === 'drysoil') {
    sim.dry = true;
    sim.soilMoisture = Math.min(sim.soilMoisture, 27); // below the default 30 % limit
  } else {
    sim.hot = false;
    sim.dry = false;
    sim.airTemp = Math.min(sim.airTemp, 27); // back to comfortable (the fan switches off)
    sim.soilMoisture = Math.max(sim.soilMoisture, 60);
  }
  applyFanLogic();
  publishTelemetry(`scenario ${scenario}`);
}

client.on('connect', () => {
  console.log(`connected to ${opts.url} as ${opts.device} (interval ${opts.interval}s)`);
  client.publish(statusTopic, 'online', { qos: 1, retain: true });
  client.subscribe(topics.command(opts.device), { qos: 1 });
  client.subscribe(topics.sim(opts.device), { qos: 1 });
  publishTelemetry('connected');
  timer ??= setInterval(() => {
    step(opts.interval);
    publishTelemetry();
  }, opts.interval * 1000);
});

client.on('message', (topic, payload) => {
  let json: unknown;
  try {
    json = JSON.parse(payload.toString('utf8'));
  } catch {
    json = undefined;
  }
  if (topic === topics.sim(opts.device)) {
    const scenario = SimScenarioSchema.safeParse(json);
    if (scenario.success) handleScenario(scenario.data.scenario);
    else console.warn(`rejected scenario: ${payload.toString('utf8').slice(0, 120)}`);
    return;
  }
  const cmd = DeviceCommandSchema.safeParse(json);
  if (!cmd.success) {
    console.warn(`rejected command: ${payload.toString('utf8').slice(0, 120)}`);
    return;
  }
  handleCommand(cmd.data);
});

client.on('reconnect', () => {
  console.log('reconnecting…');
});
client.on('error', (err) => {
  console.error(`mqtt error: ${err.message}`);
});

if (opts.stallAfter !== undefined) {
  setTimeout(() => {
    stalled = true;
    console.log(
      `⏸  stalled: no more telemetry (still connected). Backend should mark offline after ~${3 * opts.interval + 2}s.`,
    );
  }, opts.stallAfter * 1000);
}

let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(1);
  stopping = true;
  clearInterval(timer);
  if (opts.crash) {
    console.log(
      '💥 crash: dropping the connection without goodbye → broker publishes the Last Will',
    );
    client.end(true, () => process.exit(0));
    return;
  }
  console.log('stopping: publishing retained "offline" and disconnecting');
  client.publish(statusTopic, 'offline', { qos: 1, retain: true }, () => {
    client.end(false, () => process.exit(0));
  });
});

console.log(
  `simulator ${opts.device}: ${sim.hot ? 'HOT ' : ''}${sim.dry ? 'DRY ' : ''}— Ctrl+C to stop` +
    (opts.crash ? ' (crash mode)' : ''),
);
