import { randomUUID } from 'node:crypto';
import type { MqttClient } from 'mqtt';
import type { DeviceCommand, FanMode } from '../domain/schemas.js';
import { ApiError } from '../http/errors.js';
import { createLogger } from '../lib/logger.js';
import { topics } from './topics.js';

const log = createLogger('command');
const PUBLISH_TIMEOUT_MS = 5_000;

export interface CommandSender {
  isBrokerConnected(): boolean;
  /** Publishes setFanMode; returns the command id. Throws 503 if the broker is down. */
  sendFanMode(deviceId: string, mode: FanMode): Promise<string>;
  /** Publishes setFanThresholds; returns the command id. Throws 503 if the broker is down. */
  sendFanThresholds(deviceId: string, fanOnTemp: number, fanOffTemp: number): Promise<string>;
  /** Publishes calibrateSoil (device stores its current soil reading as the dry/wet point). */
  sendSoilCalibration(deviceId: string, point: 'dry' | 'wet'): Promise<string>;
}

export function createCommandSender(client: MqttClient): CommandSender {
  async function publish(deviceId: string, command: DeviceCommand): Promise<string> {
    // Without this check, mqtt.js would queue the publish and the HTTP request would hang.
    if (!client.connected) {
      throw new ApiError(503, 'BROKER_UNAVAILABLE', 'MQTT broker is not reachable');
    }
    // If the connection drops mid-publish, mqtt.js would wait for the reconnect:
    // answer 503 instead of hanging. (A late delivery is harmless: devices ignore
    // commands older than 30 s, contract §4.)
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new ApiError(503, 'BROKER_UNAVAILABLE', 'MQTT broker did not acknowledge in time'));
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
    sendSoilCalibration: (deviceId, point) =>
      publish(deviceId, {
        id: randomUUID(),
        type: 'calibrateSoil',
        point,
        issuedAt: new Date().toISOString(),
      }),
  };
}
