// Dev-only: fills a device's history with realistic past readings so the
// 7-day and 30-day charts have data.
//
//   npm run seed:history                       30 days for gh-01, every 5 min
//   npm run seed:history -- --days 7 --interval 10
//   npm run seed:history -- --device gh-02 --seed 42
//
// Readings are only inserted BEFORE the device's oldest existing reading, so
// real/simulated data is never overwritten or duplicated. Running it again
// adds nothing once the full window is filled.
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { prisma } from '../src/db.js';
import { DeviceIdSchema } from '../src/domain/schemas.js';

const { values: raw } = parseArgs({
  options: {
    device: { type: 'string', default: 'gh-01' },
    days: { type: 'string', default: '30' },
    interval: { type: 'string', default: '5' },
    seed: { type: 'string', default: '1' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (raw.help) {
  console.log(`Usage: npm run seed:history -- [--device gh-01] [--days 30] [--interval 5] [--seed 1]
  --interval  minutes between readings (1-60)`);
  process.exit(0);
}

const opts = z
  .object({
    device: DeviceIdSchema,
    days: z.coerce.number().int().min(1).max(90),
    interval: z.coerce.number().int().min(1).max(60),
    seed: z.coerce.number().int(),
  })
  .parse(raw);

// ---------- Deterministic random numbers ----------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(opts.seed);
const noise = (amp: number) => (rand() * 2 - 1) * amp;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

// ---------- Model (Asia/Manila local time, UTC+8, no DST) ----------

const MANILA_OFFSET_MS = 8 * 3600_000;
const DAY_MS = 86_400_000;
const manilaHour = (t: number) => (((t + MANILA_OFFSET_MS) % DAY_MS) / 3600_000 + 24) % 24;
const manilaDay = (t: number) => Math.floor((t + MANILA_OFFSET_MS) / DAY_MS);
/** 0 at night, 1 at solar noon (sunrise ~06:00, sunset ~18:30 in Manila). */
const daylight = (h: number) => Math.max(0, Math.sin((Math.PI * (h - 6)) / 12.5));

/** Per-day weather so days differ: cloud cover and a temperature shift. */
const weatherByDay = new Map<number, { cloud: number; tempShift: number }>();
function weather(day: number) {
  let w = weatherByDay.get(day);
  if (!w) {
    const r = rand();
    w = {
      cloud: r < 0.25 ? 0.35 + rand() * 0.25 : 0.75 + rand() * 0.25, // ~1 in 4 days overcast
      tempShift: noise(2.5) + (r > 0.85 ? 3 : 0), // occasional heat days
    };
    weatherByDay.set(day, w);
  }
  return w;
}

const FAN_ON = 32;
const FAN_OFF = 28;

// ---------- Main ----------

async function main() {
  const intervalMs = opts.interval * 60_000;
  const now = Date.now();
  const windowStart = now - opts.days * DAY_MS;

  const device = await prisma.device.findUnique({ where: { id: opts.device } });
  if (!device) {
    await prisma.device.create({
      data: { id: opts.device, name: opts.device, thresholds: { create: {} } },
    });
    console.log(`created device ${opts.device}`);
  }

  const oldest = await prisma.reading.findFirst({
    where: { deviceId: opts.device },
    orderBy: { ts: 'asc' },
    select: { ts: true },
  });
  const end = (oldest?.ts.getTime() ?? now) - intervalMs;
  if (end <= windowStart) {
    console.log(
      `${opts.device} already has data back to ${new Date(end + intervalMs).toISOString()}; nothing to add.`,
    );
    return;
  }

  // Walk forward in time so soil drying / watering / fan state are continuous.
  const start = Math.ceil(windowStart / intervalMs) * intervalMs;
  let airTemp = 22;
  let humidity = 75;
  let soil = 60;
  let fanOn = false;
  let rssi = -60;
  const rows: {
    deviceId: string;
    ts: Date;
    airTemp: number | null;
    humidity: number | null;
    soilMoisture: number;
    soilRaw: number;
    lux: number;
    fanOn: boolean;
    fanMode: string;
    rssi: number;
  }[] = [];

  const dt = opts.interval * 60; // seconds
  for (let t = start; t <= end; t += intervalMs) {
    const h = manilaHour(t);
    const w = weather(manilaDay(t));
    const sun = daylight(h);

    const outside = 26 + w.tempShift + 4.5 * Math.sin((2 * Math.PI * (h - 9)) / 24);
    const target = outside + 7 * sun * w.cloud - (fanOn ? 4 : 0);
    airTemp += (target - airTemp) * (1 - Math.exp(-dt / 900)) + noise(0.15);
    if (airTemp >= FAN_ON) fanOn = true;
    else if (airTemp <= FAN_OFF) fanOn = false;

    const rhTarget = clamp(92 - (airTemp - 22) * 3 - (fanOn ? 6 : 0), 35, 98);
    humidity = clamp(
      humidity + (rhTarget - humidity) * (1 - Math.exp(-dt / 1200)) + noise(0.6),
      0,
      100,
    );

    soil -= ((1.0 + Math.max(0, airTemp - 22) * 0.12) * dt) / 3600;
    // Watering: mostly mornings, or when it gets too dry.
    if (soil < 30 || (h >= 6.5 && h < 7 && soil < 55 && rand() < 0.5))
      soil = Math.min(85, soil + 25 + rand() * 10);
    soil = clamp(soil + noise(0.1), 5, 100);

    const lux = sun > 0 ? sun * 38_000 * w.cloud * (1 + noise(0.05)) : rand() * 2;
    rssi = clamp(rssi + noise(1.2), -78, -48);

    rows.push({
      deviceId: opts.device,
      ts: new Date(t),
      // ~0.2 % sensor read failures, like a real DHT22
      airTemp: rand() < 0.002 ? null : round(airTemp, 1),
      humidity: rand() < 0.002 ? null : round(humidity, 1),
      soilMoisture: round(soil, 1),
      soilRaw: Math.round(3200 - (soil / 100) * (3200 - 1350) + noise(8)),
      lux: round(lux, 1),
      fanOn,
      fanMode: 'auto',
      rssi: Math.round(rssi),
    });
  }

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await prisma.reading.createMany({ data: rows.slice(i, i + BATCH) });
  }
  const first = rows[0];
  const last = rows.at(-1);
  console.log(
    `inserted ${rows.length} readings for ${opts.device} every ${opts.interval} min, ` +
      `${first?.ts.toISOString()} → ${last?.ts.toISOString()}`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
