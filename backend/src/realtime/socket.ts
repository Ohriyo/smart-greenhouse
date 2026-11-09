import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { AlertDto, DeviceDto, FanStateDto, ReadingDto } from '../domain/dto.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('socket');

/** Server -> client events. Keep in sync with docs/api-contract.md. */
export interface ServerToClientEvents {
  telemetry: (reading: ReadingDto) => void;
  'device:status': (device: DeviceDto) => void;
  'fan:state': (state: FanStateDto) => void;
  alert: (alert: AlertDto) => void;
}

// No client -> server events yet.
export type ClientToServerEvents = Record<string, never>;

export interface Realtime {
  emitTelemetry(reading: ReadingDto): void;
  emitDeviceStatus(device: DeviceDto): void;
  emitFanState(state: FanStateDto): void;
  emitAlert(alert: AlertDto): void;
  close(): Promise<void>;
}

export function createRealtime(httpServer: HttpServer): Realtime {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    serveClient: false,
  });

  io.on('connection', (socket) => {
    log.info(`client connected ${socket.id} (${socket.handshake.address})`);
    socket.on('disconnect', (reason) => {
      log.info(`client disconnected ${socket.id}: ${reason}`);
    });
  });

  return {
    emitTelemetry: (reading) => io.emit('telemetry', reading),
    emitDeviceStatus: (device) => io.emit('device:status', device),
    emitFanState: (state) => io.emit('fan:state', state),
    emitAlert: (alert) => io.emit('alert', alert),
    close: () =>
      new Promise((resolve) => {
        void io.close(() => {
          resolve();
        });
      }),
  };
}
