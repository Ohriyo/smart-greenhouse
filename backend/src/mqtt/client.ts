import { randomUUID } from 'node:crypto';
import { connect, type MqttClient } from 'mqtt';
import { createLogger } from '../lib/logger.js';
import { SUBSCRIPTIONS } from './topics.js';

const log = createLogger('mqtt');

const MIN_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

/** Exponential backoff with "equal jitter": 1 s, 2 s, 4 s … capped at 30 s, each 50–100 %. */
export function reconnectDelay(attempt: number, random = Math.random): number {
  const base = Math.min(MAX_RECONNECT_MS, MIN_RECONNECT_MS * 2 ** Math.max(0, attempt));
  return Math.round(base / 2 + random() * (base / 2));
}

/** "mqtts://host:8883" without any path, query or login: safe to log. */
export function brokerLabel(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'the broker';
  }
}

/**
 * The text of a connection error. A refused connection to a host with several
 * addresses (localhost = ::1 and 127.0.0.1) is an AggregateError with an EMPTY
 * message: use its inner errors, or the error code.
 */
export function errorText(err: Error): string {
  if (err.message) return err.message;
  if (err instanceof AggregateError) {
    const inner = err.errors
      .map((e: unknown) => (e instanceof Error ? e.message : String(e)))
      .filter(Boolean);
    if (inner.length) return [...new Set(inner)].join('; ');
  }
  const code = (err as Error & { code?: unknown }).code;
  return typeof code === 'string' ? code : err.name;
}

/** Plain-language hint for a broker error (wrong login, TLS, DNS …). */
export function explainBrokerError(message: string): string {
  if (/bad user ?name or password|not authori[sz]ed/i.test(message)) {
    return `${message}: check MQTT_USERNAME / MQTT_PASSWORD (EMQX → Access Control → Authentication)`;
  }
  if (/ENOTFOUND|EAI_AGAIN/.test(message)) return `${message}: check the host in MQTT_URL`;
  if (/certificate|self[- ]signed|TLS|SSL/i.test(message)) {
    return `${message}: TLS problem (use mqtts://…:8883 for EMQX Serverless)`;
  }
  if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET/.test(message)) {
    return `${message}: broker unreachable (check the port in MQTT_URL)`;
  }
  return message;
}

export interface BrokerOptions {
  url: string;
  username?: string | undefined;
  password?: string | undefined;
}

/**
 * Connects to the broker (EMQX in production) and keeps reconnecting forever with
 * backoff + jitter. Subscriptions are made in our own `connect` handler, so mqtt.js'
 * automatic resubscribe is off: otherwise retained messages would arrive twice after
 * every reconnect.
 */
export function connectMqtt({ url, username, password }: BrokerOptions): MqttClient {
  const where = brokerLabel(url);
  const client = connect(url, {
    clientId: `greenhouse-backend-${randomUUID().slice(0, 8)}`,
    ...(username !== undefined ? { username } : {}),
    ...(password !== undefined ? { password } : {}),
    protocolVersion: 4, // MQTT 3.1.1, like the ESP32 (PubSubClient)
    clean: true,
    keepalive: 30,
    reconnectPeriod: MIN_RECONNECT_MS,
    // mqtt.js 5.16+ stops after a refused CONNACK (e.g. a wrong password) unless told
    // otherwise. Keep trying with backoff: the login may be fixed in EMQX meanwhile.
    reconnectOnConnackError: true,
    connectTimeout: 15_000,
    resubscribe: false,
  });

  let attempt = 0;
  let downSince: number | null = null;
  let lastError = '';

  client.on('connect', () => {
    if (downSince !== null) {
      const sec = Math.round((Date.now() - downSince) / 1000);
      log.info(`reconnected to ${where} after ${sec} s (${attempt} attempt(s))`);
    } else {
      log.info(`connected to ${where}`);
    }
    attempt = 0;
    downSince = null;
    lastError = '';
    client.options.reconnectPeriod = MIN_RECONNECT_MS;
    client.subscribe(SUBSCRIPTIONS, { qos: 1 }, (err, granted) => {
      if (err) {
        log.error(`subscribe failed: ${err.message}`);
        return;
      }
      // EMQX answers 128 (failure) for a topic the login may not subscribe to (ACL).
      const refused = (granted ?? []).filter((g) => g.qos === 128).map((g) => g.topic);
      if (refused.length) {
        log.error(
          `broker refused the subscription to ${refused.join(', ')}: allow it for this login in EMQX (Access Control → Authorization)`,
        );
      } else {
        log.info(`subscribed to ${SUBSCRIPTIONS.join(', ')}`);
      }
    });
  });

  client.on('close', () => {
    if (downSince === null) {
      downSince = Date.now();
      log.warn(`connection to ${where} lost; retrying with backoff (HTTPS readings still work)`);
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
        `${where} unreachable for ${sec} s, attempt ${attempt}; next try in ~${Math.round(next / 1000)} s`,
      );
    }
  });

  client.on('error', (err) => {
    // The same error repeats on every retry: log it once (until it changes).
    const text = errorText(err);
    if (text === lastError) return;
    lastError = text;
    log.error(explainBrokerError(text));
  });

  return client;
}
