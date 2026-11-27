import type { DeviceCommand } from '../domain/schemas.js';
import type { CommandPublisher } from '../ingest/commands.js';
import { createLogger } from '../lib/logger.js';
import { topics } from './topics.js';

const log = createLogger('command');
const PUBLISH_TIMEOUT_MS = 5_000;

/** The part of an mqtt.js client this needs (a fake in tests). */
export interface PublishClient {
  readonly connected: boolean;
  publishAsync(topic: string, message: string, opts: { qos: 1; retain: false }): Promise<unknown>;
}

/**
 * Publishes commands with QoS 1 (the broker acknowledges). Not retained: a device
 * that is offline must not get an old command when it reconnects.
 */
export function createCommandPublisher(client: PublishClient): CommandPublisher {
  return {
    isConnected: () => client.connected,
    async publish(deviceId, command: DeviceCommand) {
      // Without this check mqtt.js would queue the publish until it reconnects.
      if (!client.connected) throw new Error('MQTT broker not connected');
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('MQTT broker did not acknowledge in time'));
        }, PUBLISH_TIMEOUT_MS);
      });
      try {
        await Promise.race([
          client.publishAsync(topics.command(deviceId), JSON.stringify(command), {
            qos: 1,
            retain: false,
          }),
          timeout,
        ]);
      } finally {
        clearTimeout(timer);
      }
      log.info(`${deviceId} <- ${command.type} (${command.id}) over MQTT`);
    },
  };
}
