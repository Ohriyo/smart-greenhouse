import { randomUUID } from 'node:crypto';
import type { MqttClient } from 'mqtt';
import type { DeviceCommand, FanMode } from '../domain/schemas.js';
import { ApiError } from '../http/errors.js';
import { createLogger } from '../lib/logger.js';
import { topics } from './topics.js';

const log = createLogger('command');

export interface CommandSender {
  isBrokerConnected(): boolean;
  /** Publishes setFanMode; returns the command id. Throws 503 if the broker is down. */
  sendFanMode(deviceId: string, mode: FanMode): Promise<string>;
  /** Publishes setFanThresholds; returns the command id. Throws 503 if the broker is down. */
  sendFanThresholds(deviceId: string, fanOnTemp: number, fanOffTemp: number): Promise<string>;
}

export function createCommandSender(client: MqttClient): CommandSender {
  async function publish(deviceId: string, command: DeviceCommand): Promise<string> {
    // Without this check, mqtt.js would queue the publish and the HTTP request would hang.
    if (!client.connected) {
      throw new ApiError(503, 'BROKER_UNAVAILABLE', 'MQTT broker is not reachable');
    }
    await client.publishAsync(topics.command(deviceId), JSON.stringify(command), {
      qos: 1,
      retain: false,
    });
    log.info(`${deviceId} <- ${command.type} (${command.id})`);
    return command.id;
  }

  return {
    isBrokerConnected: () => client.connected,
    sendFanMode: (deviceId, mode) =>
      publish(deviceId, {
        id: randomUUID(),
        type: 'setFanMode',
        mode,
        issuedAt: new Date().toISOString(),
      }),
    sendFanThresholds: (deviceId, fanOnTemp, fanOffTemp) =>
      publish(deviceId, {
        id: randomUUID(),
        type: 'setFanThresholds',
        fanOnTemp,
        fanOffTemp,
        issuedAt: new Date().toISOString(),
      }),
  };
}
