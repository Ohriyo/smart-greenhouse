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

const SOIL_RAW_DRY = 3200; // ADC counts in dry air (calibration "dry")
const SOIL_RAW_WET = 1350; // ADC counts in water (calibration "wet")

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
};

function targetAirTemp(h: number): number {
  if (opts.hot) return 41 - (sim.fanOn ? 1.5 : 0); // the fan can't keep up
  return outsideTemp(h) + 6 * daylight(h) * sim.cloud - (sim.fanOn ? 4 : 0);
}

// Start near equilibrium so the first readings are realistic.
{
  const h = hourOfDay();
  // --hot starts just below the default airTempMax (35 °C) so alerts show up quickly.
  sim.airTemp = opts.hot ? 34 : targetAirTemp(h);
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
  sim.airTemp = approach(sim.airTemp, targetAirTemp(h), dt, opts.hot ? 60 : 600) + noise(0.05);

  const rhTarget = clamp(90 - (sim.airTemp - 16) * 2.2 - (sim.fanOn ? 6 : 0), 25, 98);
  sim.humidity = clamp(approach(sim.humidity, rhTarget, dt, 300) + noise(0.3), 0, 100);

  // Soil dries faster when warm; --dry makes it ~40 %/h for quick alerts.
  const dryPerHour = (opts.dry ? 40 : 1.2) + Math.max(0, sim.airTemp - 20) * 0.15;
  sim.soilMoisture = Math.max(5, sim.soilMoisture - (dryPerHour * dt) / 3600);
  const randomWatering = sim.soilMoisture < 55 && Math.random() < dt / (3 * 3600);
  if (!opts.dry && (sim.soilMoisture < 32 || randomWatering)) {
    const before = sim.soilMoisture;
    sim.soilMoisture = Math.min(85, sim.soilMoisture + 25 + Math.random() * 10);
    console.log(`💧 watering: soil ${before.toFixed(0)}% → ${sim.soilMoisture.toFixed(0)}%`);
  }

  sim.rssi = clamp(sim.rssi + noise(1.5), -78, -45);
  applyFanLogic();
}

function telemetryPayload() {
  const soilRaw = Math.round(
    SOIL_RAW_DRY - (sim.soilMoisture / 100) * (SOIL_RAW_DRY - SOIL_RAW_WET) + noise(8),
  );
  return {
    ts: Date.now(),
    intervalSec: opts.interval,
    airTemp: round(sim.airTemp, 1),
    humidity: round(sim.humidity, 1),
    soilMoisture: round(sim.soilMoisture, 1),
    soilRaw,
    lux: round(sim.lux, 1),
    fanOn: sim.fanOn,
    fanMode: sim.fanMode,
    rssi: Math.round(sim.rssi),
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

function handleCommand(cmd: DeviceCommand): void {
  if (cmd.type === 'setFanMode') {
    sim.fanMode = cmd.mode;
    applyFanLogic();
    publishTelemetry(`setFanMode ${cmd.mode}`);
  } else {
    sim.fanOnTemp = cmd.fanOnTemp;
    sim.fanOffTemp = cmd.fanOffTemp;
    applyFanLogic();
    publishTelemetry(`setFanThresholds ${cmd.fanOnTemp}/${cmd.fanOffTemp}`);
  }
}

client.on('connect', () => {
  console.log(`connected to ${opts.url} as ${opts.device} (interval ${opts.interval}s)`);
  client.publish(statusTopic, 'online', { qos: 1, retain: true });
  client.subscribe(topics.command(opts.device), { qos: 1 });
  publishTelemetry('connected');
  timer ??= setInterval(() => {
    step(opts.interval);
    publishTelemetry();
  }, opts.interval * 1000);
});

client.on('message', (_topic, payload) => {
  let json: unknown;
  try {
    json = JSON.parse(payload.toString('utf8'));
  } catch {
    json = undefined;
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
  `simulator ${opts.device}: ${opts.hot ? 'HOT ' : ''}${opts.dry ? 'DRY ' : ''}— Ctrl+C to stop` +
    (opts.crash ? ' (crash mode)' : ''),
);
