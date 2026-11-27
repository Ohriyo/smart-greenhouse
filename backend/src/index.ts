import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { Expo } from 'expo-server-sdk';
import { env } from './config/env.js';
import { closeDatabase } from './db.js';
import { createDevTools } from './dev/devTools.js';
import { createApp } from './http/app.js';
import { isAllowedOrigin } from './http/cors.js';
import { createPendingCommands } from './ingest/commands.js';
import { createIngest } from './ingest/ingest.js';
import { createLogger } from './lib/logger.js';
import { createPushSender } from './push/sender.js';
import { createRealtime } from './realtime/socket.js';
import { createRulesEngine } from './rules/engine.js';
import {
  deletePushTokens,
  getNotificationSettings,
  listPushTokens,
} from './services/notifications.js';
import { startPresenceSweeper } from './services/presence.js';
import { startRetentionJob } from './services/retention.js';
import { createSmsNotifier } from './sms/notifier.js';
import { createSmsProvider } from './sms/provider.js';
import { createPrismaSmsStore } from './sms/prismaStore.js';
import { startSmsSweeper } from './sms/sweeper.js';

const log = createLogger('main');
const startedAt = new Date();

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a !== undefined && a.family === 'IPv4' && !a.internal)
    .map((a) => a?.address ?? '');
}

const realtime = createRealtime();
const commands = createPendingCommands();

// Expo Push Service → FCM → phone.
const push = createPushSender({
  client: new Expo(env.EXPO_ACCESS_TOKEN ? { accessToken: env.EXPO_ACCESS_TOKEN } : {}),
  store: {
    getSettings: getNotificationSettings,
    listTokens: listPushTokens,
    removeTokens: deletePushTokens,
  },
  enabled: env.PUSH_ENABLED,
});

// SMS alerts to ALERT_PHONE_NUMBERS (textbee or Semaphore). Dry run records and logs only.
const sms = createSmsNotifier({
  store: createPrismaSmsStore(),
  provider: createSmsProvider(env),
  providerName: env.SMS_PROVIDER,
  dryRun: env.SMS_DRY_RUN,
  recipients: env.ALERT_PHONE_NUMBERS,
  cooldownMs: env.ALERT_COOLDOWN_MINUTES * 60_000,
  dailyCap: env.SMS_DAILY_CAP,
  offlineAfterMs: env.SMS_OFFLINE_AFTER_MINUTES * 60_000,
});
if (env.ALERT_PHONE_NUMBERS.length === 0) {
  log.warn('SMS alerts off: ALERT_PHONE_NUMBERS is empty');
} else {
  log.info(
    `SMS alerts to ${env.ALERT_PHONE_NUMBERS.length} number(s) via ${env.SMS_PROVIDER}` +
      (env.SMS_DRY_RUN ? ' — DRY RUN: recorded and logged, nothing is sent' : ' — LIVE'),
  );
  if (!env.SMS_DRY_RUN && env.SMS_PROVIDER === 'textbee' && !env.TEXTBEE_DEVICE_ID) {
    log.warn('TEXTBEE_DEVICE_ID is empty: textbee picks the phone (set it to be sure)');
  }
}

// Dev-only Demo tools (DEV_TOOLS=true): scenarios for the simulator.
const devTools = createDevTools({ enabled: env.DEV_TOOLS, commands });
if (env.DEV_TOOLS) log.warn('DEV_TOOLS=true: demo scenario endpoints are enabled (/api/dev)');

const rules = createRulesEngine({
  realtime,
  cooldownMs: env.ALERT_COOLDOWN_MINUTES * 60_000,
  onAlert: (alert) => {
    void push.notifyAlert(alert); // never throws
  },
  onSmsCandidate: (candidate) => {
    void sms.onCandidate(candidate); // never throws; runs after the reading was stored
  },
});

const ingest = createIngest({ realtime, rules, devTools, commands });

const server = createServer(
  createApp({
    ingest,
    commands,
    push,
    sms,
    devTools,
    realtime,
    config: {
      deviceApiKey: env.DEVICE_API_KEY,
      adminApiKey: env.ADMIN_API_KEY,
      corsOrigins: env.CORS_ORIGIN,
      defaultDeviceId: env.DEFAULT_DEVICE_ID,
    },
  }),
);
realtime.attach(server, (origin) => isAllowedOrigin(origin, env.CORS_ORIGIN));

const stopRetention = startRetentionJob(env.READINGS_RETENTION_DAYS);
const stopSmsSweeper = startSmsSweeper(sms);
// Devices get a full reporting window after every start (e.g. a Render cold start).
const stopSweeper = startPresenceSweeper({
  realtime,
  rules,
  fallbackSec: env.OFFLINE_AFTER_SEC,
  listeningSince: () => startedAt,
});

server.listen(env.PORT, '0.0.0.0', () => {
  log.info(`HTTP + Socket.IO listening on port ${env.PORT} (${env.NODE_ENV})`);
  if (env.CORS_ORIGIN.length) log.info(`CORS origins: ${env.CORS_ORIGIN.join(', ')} + localhost`);
  if (env.NODE_ENV !== 'production') {
    for (const ip of lanAddresses()) log.info(`  LAN: http://${ip}:${env.PORT}`);
  }
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
  await ingest.idle(); // finish alert rules for readings already accepted
  await sms.idle(); // ...and their SMS
  await closeDatabase();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
