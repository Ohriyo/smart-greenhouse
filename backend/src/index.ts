import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { env } from './config/env.js';
import { prisma } from './db.js';
import { createApp } from './http/app.js';
import { createLogger } from './lib/logger.js';
import { connectMqtt } from './mqtt/client.js';
import { createCommandSender } from './mqtt/commands.js';
import { createIngest } from './mqtt/ingest.js';
import { createRealtime } from './realtime/socket.js';
import { createRulesEngine } from './rules/engine.js';
import { startPresenceSweeper } from './services/presence.js';

const log = createLogger('main');

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a !== undefined && a.family === 'IPv4' && !a.internal)
    .map((a) => a?.address ?? '');
}

const mqtt = connectMqtt(env.MQTT_URL);
const commands = createCommandSender(mqtt);
const server = createServer(createApp(commands));
const realtime = createRealtime(server);
const rules = createRulesEngine({ realtime, cooldownMs: env.ALERT_COOLDOWN_MIN * 60_000 });
const ingest = createIngest({ realtime, commands, rules });

mqtt.on('message', (topic, payload, packet) => {
  ingest.handleMessage(topic, payload, packet.retain);
});

// Offline timeouts only count time during which we were actually listening.
let listeningSince: Date | null = null;
mqtt.on('connect', () => {
  listeningSince = new Date();
});
mqtt.on('close', () => {
  listeningSince = null;
});

const stopSweeper = startPresenceSweeper({
  realtime,
  rules,
  fallbackSec: env.OFFLINE_AFTER_SEC,
  listeningSince: () => listeningSince,
});

server.listen(env.PORT, '0.0.0.0', () => {
  log.info(`HTTP + Socket.IO listening on port ${env.PORT}`);
  for (const ip of lanAddresses()) log.info(`  LAN: http://${ip}:${env.PORT}`);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`${signal} received, shutting down`);
  stopSweeper();
  await realtime.close(); // also closes the HTTP server
  await mqtt.endAsync();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
