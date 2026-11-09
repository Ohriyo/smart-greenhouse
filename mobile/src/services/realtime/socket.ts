import { io, type Socket } from 'socket.io-client';
import type { z } from 'zod';

import { useLiveStore } from '@/store/liveStore';
import { SocketEventSchemas, type SocketEventName } from '@/types/api';

let socket: Socket | null = null;
let currentUrl: string | null = null;

interface ConnectOptions {
  /** Called on every (re)connect: events missed while disconnected aren't replayed. */
  onConnect?: () => void;
}

/** Validates an event payload with its Zod schema; invalid payloads are dropped. */
function on<E extends SocketEventName>(
  s: Socket,
  event: E,
  handler: (payload: z.infer<(typeof SocketEventSchemas)[E]>) => void,
) {
  // Our events aren't in socket.io's typed map; a plain string name keeps the
  // payload `unknown` until Zod has validated it.
  const name: string = event;
  s.on(name, (raw: unknown) => {
    const parsed = SocketEventSchemas[event].safeParse(raw);
    if (parsed.success) handler(parsed.data as z.infer<(typeof SocketEventSchemas)[E]>);
    else if (__DEV__)
      console.warn(`[socket] invalid "${event}" payload dropped`, parsed.error.issues);
  });
}

/**
 * Connects the single app-wide socket to `url`, replacing any previous one.
 * Passing the same URL again is a no-op. Returns a disconnect function.
 */
export function connectRealtime(url: string, options: ConnectOptions = {}): () => void {
  if (socket && currentUrl === url) return disconnectRealtime;
  disconnectRealtime();

  const live = useLiveStore.getState();
  live.setSocket('connecting');

  const s = io(url, {
    transports: ['websocket'], // React Native: skip HTTP long-polling
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 8000,
  });
  socket = s;
  currentUrl = url;

  s.on('connect', () => {
    useLiveStore.getState().setSocket('connected');
    options.onConnect?.();
  });
  // Connection dropped (laptop asleep, Wi-Fi blip, backend restart): socket.io retries.
  s.on('disconnect', (reason) => {
    // "io client disconnect" = we closed it ourselves; nothing to show.
    if (reason !== 'io client disconnect') useLiveStore.getState().setSocket('reconnecting');
  });
  // Any failed (re)connection attempt: the server is currently unreachable.
  s.on('connect_error', (err) => {
    useLiveStore.getState().setSocket('error', err.message);
  });

  on(s, 'telemetry', (reading) => useLiveStore.getState().setReading(reading));
  on(s, 'device:status', (device) => useLiveStore.getState().upsertDevice(device));
  on(s, 'fan:state', (fan) => useLiveStore.getState().applyFanState(fan));
  // 'alert' is handled in the alerts phase.

  return disconnectRealtime;
}

export function disconnectRealtime(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  currentUrl = null;
  useLiveStore.getState().setSocket('idle');
}
