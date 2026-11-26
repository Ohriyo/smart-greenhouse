import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { AlertDto, DeviceDto, ReadingDto } from '../domain/dto.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('socket');

/** Server -> client events. Keep in sync with docs/api-contract.md. */
export interface ServerToClientEvents {
  telemetry: (reading: ReadingDto) => void;
  'device:status': (device: DeviceDto) => void;
  alert: (alert: AlertDto) => void;
}

// No client -> server events yet.
export type ClientToServerEvents = Record<string, never>;

export interface Realtime {
  emitTelemetry(reading: ReadingDto): void;
  emitDeviceStatus(device: DeviceDto): void;
  emitAlert(alert: AlertDto): void;
  /**
   * Starts Socket.IO on the HTTP server. Before this, emits are no-ops (the app
   * is created before the server it runs on).
   */
  attach(httpServer: HttpServer, isAllowedOrigin: (origin: string) => boolean): void;
  /** Closes Socket.IO and the HTTP server it is attached to. */
  close(): Promise<void>;
}

export function createRealtime(): Realtime {
  let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

  return {
    attach(httpServer, isAllowedOrigin) {
      io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
        serveClient: false,
        // Browser clients (the Vercel web app) are checked like REST calls;
        // the Android app sends no Origin header.
        cors: {
          origin: (origin, callback) => {
            callback(null, origin === undefined || isAllowedOrigin(origin));
          },
        },
      });
      io.on('connection', (socket) => {
        log.info(`client connected ${socket.id}`);
        socket.on('disconnect', (reason) => {
          log.info(`client disconnected ${socket.id}: ${reason}`);
        });
      });
    },
    emitTelemetry: (reading) => io?.emit('telemetry', reading),
    emitDeviceStatus: (device) => io?.emit('device:status', device),
    emitAlert: (alert) => io?.emit('alert', alert),
    close: () =>
      new Promise((resolve) => {
        if (!io) {
          resolve();
          return;
        }
        void io.close(() => {
          resolve();
        });
      }),
  };
}
