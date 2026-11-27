// Must stay the first import: sets the test environment before the app's config loads.
import { TEST_ADMIN_KEY, TEST_DEVICE_KEY, TEST_NUMBERS, TEST_ORIGIN } from './setup.js';

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { prisma } from '../db.js';
import { createDevTools } from '../dev/devTools.js';
import { createApp } from '../http/app.js';
import {
  createCommandRouter,
  createPendingCommands,
  type CommandPublisher,
  type CommandRouter,
} from '../ingest/commands.js';
import { createIngest, type Ingest } from '../ingest/ingest.js';
import { createMqttBridge, type MqttBridge } from '../mqtt/bridge.js';
import type { PushSender } from '../push/sender.js';
import { createRealtime } from '../realtime/socket.js';
import { createRulesEngine } from '../rules/engine.js';
import { createSmsNotifier, type SmsNotifier } from '../sms/notifier.js';
import { createPrismaSmsStore } from '../sms/prismaStore.js';
import type { SmsProvider } from '../sms/provider.js';

export * from './setup.js';

const MIN = 60_000;

/** Push is not under test here: a sender that does nothing. */
const noPush: PushSender = {
  notifyAlert: () => Promise.resolve(null),
  sendTest: () => Promise.resolve({ tokens: 0, sent: 0, failed: 0, removed: 0 }),
  checkReceipts: () => Promise.resolve(),
  stop: () => undefined,
};

export interface TestServer {
  /** http://127.0.0.1:<port> */
  base: string;
  sms: SmsNotifier;
  ingest: Ingest;
  commands: CommandRouter;
  /** The MQTT side, fed by tests with handleMessage (no broker needed). */
  bridge: MqttBridge;
  /** Waits until the background work (alert rules, SMS) of accepted readings is done. */
  settle(): Promise<void>;
  close(): Promise<void>;
}

/**
 * The real app (routes, ingest, rules engine, SMS with the Prisma store) on a
 * random port. Built fresh per test: the rules engine keeps state in memory.
 */
export async function startTestServer(
  opts: {
    provider?: SmsProvider | null;
    dryRun?: boolean;
    clock?: () => number;
    /** Fake broker publish for commands (default: MQTT off). */
    publisher?: CommandPublisher | null;
    lastWillGraceMs?: number;
  } = {},
): Promise<TestServer> {
  const clock = opts.clock ?? Date.now;
  const realtime = createRealtime(); // not attached: emits are no-ops
  const commands = createCommandRouter(createPendingCommands(clock), opts.publisher ?? null);
  const sms = createSmsNotifier({
    store: createPrismaSmsStore(),
    provider: opts.provider ?? null,
    providerName: 'textbee',
    dryRun: opts.dryRun ?? false,
    recipients: TEST_NUMBERS,
    cooldownMs: 30 * MIN,
    dailyCap: 10,
    offlineAfterMs: 10 * MIN,
    clock,
  });
  const devTools = createDevTools({ enabled: false, commands });
  const rules = createRulesEngine({
    realtime,
    cooldownMs: 30 * MIN,
    onSmsCandidate: (c) => void sms.onCandidate(c),
    clock,
  });
  const ingest = createIngest({ realtime, rules, devTools, commands });
  const bridge = createMqttBridge({
    ingest,
    commands,
    realtime,
    rules,
    ...(opts.lastWillGraceMs !== undefined ? { lastWillGraceMs: opts.lastWillGraceMs } : {}),
  });
  const app = createApp({
    ingest,
    commands,
    mqttState: () => (opts.publisher ? 'connected' : 'off'),
    push: noPush,
    sms,
    devTools,
    realtime,
    config: {
      deviceApiKey: TEST_DEVICE_KEY,
      adminApiKey: TEST_ADMIN_KEY,
      corsOrigins: [TEST_ORIGIN],
      defaultDeviceId: 'gh-01',
    },
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    sms,
    ingest,
    commands,
    bridge,
    async settle() {
      await ingest.idle();
      await sms.idle();
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        bridge.close();
        server.closeAllConnections();
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

/** Empties every table (ids restart at 1). Test database only (checked in ./setup.ts). */
export async function resetDb(): Promise<void> {
  await prisma.$executeRaw`TRUNCATE "SmsAlert", "Alert", "Reading", "Thresholds", "Device",
    "PushToken", "NotificationSettings" RESTART IDENTITY CASCADE`;
}

/** POST /api/readings like the ESP32 does. */
export function postReading(
  base: string,
  body: unknown,
  key: string | null = TEST_DEVICE_KEY,
): Promise<Response> {
  return fetch(`${base}/api/readings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key === null ? {} : { 'X-Device-Key': key }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
