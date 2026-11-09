import { randomUUID } from 'node:crypto';
import { connect, type MqttClient } from 'mqtt';
import { createLogger } from '../lib/logger.js';
import { SUBSCRIPTIONS } from './topics.js';

const log = createLogger('mqtt');

export function connectMqtt(url: string): MqttClient {
  const client = connect(url, {
    clientId: `greenhouse-backend-${randomUUID().slice(0, 8)}`,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 10_000,
  });

  client.on('connect', () => {
    log.info(`connected to ${url}`);
    // Re-subscribe on every (re)connect; retained status messages are re-delivered.
    client.subscribe(SUBSCRIPTIONS, { qos: 1 }, (err) => {
      if (err) log.error('subscribe failed', err);
      else log.info(`subscribed to ${SUBSCRIPTIONS.join(', ')}`);
    });
  });
  client.on('reconnect', () => {
    log.warn('reconnecting…');
  });
  client.on('offline', () => {
    log.warn('broker unreachable');
  });
  client.on('error', (err) => {
    log.error(err.message);
  });

  return client;
}
