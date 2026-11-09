import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { Expo } from 'expo-server-sdk';
import { env } from './config/env.js';
import { prisma } from './db.js';
import { createApp } from './http/app.js';
import { createLogger } from './lib/logger.js';
import { connectMqtt } from './mqtt/client.js';
import { createCommandSender } from './mqtt/commands.js';
import { createIngest } from './mqtt/ingest.js';
import { createRealtime, type Realtime } from './realtime/socket.js';
import { createRulesEngine } from './rules/engine.js';
import { createPushSender } from './push/sender.js';
import {
  deletePushTokens,
  getNotificationSettings,
  listPushTokens,
} from './services/notifications.js';
import { startPresenceSweeper } from './services/presence.js';
import { startRetentionJob } from './services/retention.js';
import { createDevTools } from './dev/devTools.js';
import { createSmsNotifier } from './sms/notifier.js';
import { createSmsProvider } from './sms/provider.js';
import { createPrismaSmsStore } from './sms/store.js';
import { startSmsSweeper } from './sms/sweeper.js';

const log = createLogger('main');

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a !== undefined && a.family === 'IPv4' && !a.internal)
    .map((a) => a?.address ?? '');
}

const mqtt = connectMqtt(env.MQTT_URL);
const commands = createCommandSender(mqtt);
// Expo Push Service → FCM → phone. Needs internet on the laptop.
const push = createPushSender({
  client: new Expo(env.EXPO_ACCESS_TOKEN ? { accessToken: env.EXPO_ACCESS_TOKEN } : {}),
  store: {
    getSettings: getNotificationSettings,
    listTokens: listPushTokens,
    removeTokens: deletePushTokens,
  },
  enabled: env.PUSH_ENABLED,
});
let realtimeRef: Realtime | null = null;
// SMS to the owner (critical readings, greenhouse offline). Test mode logs instead of sending.
const smsProvider = createSmsProvider(env);
const sms = createSmsNotifier({
  store: createPrismaSmsStore(),
  provider: smsProvider,
  dailyCap: env.SMS_DAILY_CAP,
});
log.info(
  smsProvider.simulated
    ? 'SMS provider: console (test mode, messages are only logged)'
    : `SMS provider: ${smsProvider.name}`,
);

// Dev-only Demo tools (DEV_TOOLS=true): scenarios for the simulator.
const devTools = createDevTools({
  enabled: env.DEV_TOOLS,
  publish: async (topic, payload) => {
    await mqtt.publishAsync(topic, payload, { qos: 1 });
  },
});
if (env.DEV_TOOLS) log.warn('DEV_TOOLS=true: demo scenario endpoints are enabled (/api/dev)');

const server = createServer(
  createApp({ commands, push, sms, devTools, getRealtime: () => realtimeRef }),
);
const realtime = createRealtime(server);
realtimeRef = realtime;
const rules = createRulesEngine({
  realtime,
  cooldownMs: env.ALERT_COOLDOWN_MIN * 60_000,
  onAlert: (alert) => {
    void push.notifyAlert(alert);
    void sms.onAlert(alert); // never throws; critical readings only
  },
});
// Offline timeouts (and trusting retained "offline") only count time during
// which we were actually connected to the broker.
let listeningSince: Date | null = null;
mqtt.on('connect', () => {
  listeningSince = new Date();
});
mqtt.on('close', () => {
  listeningSince = null;
});

const ingest = createIngest({
  realtime,
  commands,
  rules,
  sms,
  devTools,
  listeningSince: () => listeningSince,
});

mqtt.on('message', (topic, payload, packet) => {
  ingest.handleMessage(topic, payload, packet.retain);
});

const stopRetention = startRetentionJob(env.READINGS_RETENTION_DAYS);
const stopSmsSweeper = startSmsSweeper(sms);

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
  stopRetention();
  stopSmsSweeper();
  push.stop();
  await realtime.close(); // also closes the HTTP server
  await mqtt.endAsync();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
