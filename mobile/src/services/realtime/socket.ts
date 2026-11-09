import { io, type Socket } from 'socket.io-client';
import type { z } from 'zod';

import { useDemoStore } from '@/store/demoStore';
import { useLiveStore } from '@/store/liveStore';
import { useRecentStore } from '@/store/recentStore';
import { SocketEventSchemas, type Alert, type SocketEventName } from '@/types/api';

let socket: Socket | null = null;
let currentUrl: string | null = null;
/** Closed on purpose (background / phone offline); resumeRealtime() reopens it. */
let paused = false;

interface ConnectOptions {
  /** Called on every (re)connect: events missed while disconnected aren't replayed. */
  onConnect?: () => void;
  /** A new alert was created (contract §3 `alert`). */
  onAlert?: (alert: Alert) => void;
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
    // Demo "Pause live updates": freeze the data (alerts still arrive).
    if (event !== 'alert' && useDemoStore.getState().pauseLive) return;
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
    // Exponential backoff with jitter: 1 s, 2 s, 4 s … capped at 30 s, each
    // randomized ±50 % so many clients don't retry in lockstep. A network change
    // or returning to the app retries immediately (retryRealtimeNow/resumeRealtime).
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
    randomizationFactor: 0.5,
    timeout: 8000,
  });
  socket = s;
  currentUrl = url;
  paused = false;

  s.on('connect', () => {
    useLiveStore.getState().setSocket('connected');
    options.onConnect?.();
  });
  // Connection dropped (laptop asleep, Wi-Fi blip, backend restart): socket.io retries.
  s.on('disconnect', (reason) => {
    // "io client disconnect" = we closed it ourselves (pause/URL change); nothing to show.
    if (reason === 'io client disconnect') return;
    useLiveStore.getState().setSocket('reconnecting');
    // socket.io retries by itself, except when the server closed the socket on purpose.
    if (reason === 'io server disconnect') s.connect();
  });
  // Any failed (re)connection attempt: the server is currently unreachable.
  s.on('connect_error', (err) => {
    useLiveStore.getState().setSocket('error', err.message);
  });

  on(s, 'telemetry', (reading) => {
    useLiveStore.getState().setReading(reading);
    useRecentStore.getState().append(reading); // 30-min buffer for live charts
  });
  on(s, 'device:status', (device) => useLiveStore.getState().upsertDevice(device));
  on(s, 'fan:state', (fan) => useLiveStore.getState().applyFanState(fan));
  on(s, 'alert', (alert) => options.onAlert?.(alert));

  return disconnectRealtime;
}

export function disconnectRealtime(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  currentUrl = null;
  paused = false;
  useLiveStore.getState().setSocket('idle');
}

/** Closes the connection but keeps the socket (app in background, phone offline). */
export function pauseRealtime(): void {
  if (!socket || paused) return;
  paused = true;
  socket.disconnect(); // stops the retry loop too
  useLiveStore.getState().setSocket('paused');
}

/** Reopens a paused connection right away (fresh backoff). */
export function resumeRealtime(): void {
  if (!socket || !paused) return;
  paused = false;
  useLiveStore.getState().setSocket('connecting');
  socket.connect();
}

/**
 * The network changed (e.g. back on Wi-Fi): skip the remaining backoff delay
 * and try now. No-op while connected or paused.
 */
export function retryRealtimeNow(): void {
  if (!socket || paused || socket.connected) return;
  socket.disconnect();
  socket.connect();
}
