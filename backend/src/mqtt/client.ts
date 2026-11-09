import { randomUUID } from 'node:crypto';
import { connect, type MqttClient } from 'mqtt';
import { createLogger } from '../lib/logger.js';
import { SUBSCRIPTIONS } from './topics.js';

const log = createLogger('mqtt');

const MIN_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

/** Exponential backoff with "equal jitter": 1 s, 2 s, 4 s … capped at 30 s, each ±50 %. */
export function reconnectDelay(attempt: number, random = Math.random): number {
  const base = Math.min(MAX_RECONNECT_MS, MIN_RECONNECT_MS * 2 ** Math.max(0, attempt));
  return Math.round(base / 2 + random() * (base / 2));
}

/**
 * Connects to Mosquitto and keeps reconnecting forever with backoff + jitter
 * (the broker may start after the backend, or restart). Subscriptions are made
 * in our own `connect` handler, so mqtt.js' automatic resubscribe is off —
 * otherwise retained messages would be delivered twice after every reconnect.
 */
export function connectMqtt(url: string): MqttClient {
  const client = connect(url, {
    clientId: `greenhouse-backend-${randomUUID().slice(0, 8)}`,
    clean: true,
    keepalive: 30,
    reconnectPeriod: MIN_RECONNECT_MS,
    connectTimeout: 10_000,
    resubscribe: false,
  });

  let attempt = 0;
  let downSince: number | null = null;

  client.on('connect', () => {
    if (downSince !== null) {
      const sec = Math.round((Date.now() - downSince) / 1000);
      log.info(`reconnected to ${url} after ${sec} s (${attempt} attempt(s))`);
    } else {
      log.info(`connected to ${url}`);
    }
    attempt = 0;
    downSince = null;
    client.options.reconnectPeriod = MIN_RECONNECT_MS;
    // Retained status messages are re-delivered on every subscribe.
    client.subscribe(SUBSCRIPTIONS, { qos: 1 }, (err) => {
      if (err) log.error('subscribe failed', err);
      else log.info(`subscribed to ${SUBSCRIPTIONS.join(', ')}`);
    });
  });

  client.on('close', () => {
    if (downSince === null) {
      downSince = Date.now();
      log.warn('connection to the broker lost; retrying with backoff');
    }
  });

  client.on('reconnect', () => {
    attempt++;
    // mqtt.js reads reconnectPeriod when it schedules the *next* attempt.
    const next = reconnectDelay(attempt);
    client.options.reconnectPeriod = next;
    // Don't flood the log during a long outage: 1st, then every 10th attempt.
    if (attempt === 1 || attempt % 10 === 0) {
      const sec = downSince === null ? 0 : Math.round((Date.now() - downSince) / 1000);
      log.warn(
        `broker unreachable for ${sec} s, attempt ${attempt}; next try in ~${Math.round(next / 1000)} s`,
      );
    }
  });

  client.on('error', (err) => {
    // Connection errors are expected while the broker is down; log them quietly.
    if (downSince !== null) log.debug(err.message);
    else log.error(err.message);
  });

  return client;
}
