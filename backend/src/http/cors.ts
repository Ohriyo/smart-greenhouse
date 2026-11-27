import cors from 'cors';
import type { RequestHandler } from 'express';

/** Any port on this machine: `npx expo start --web`, a local web build, etc. */
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

/** CORS_ORIGIN entries (exact match) plus localhost for development. */
export function isAllowedOrigin(origin: string, allowed: readonly string[]): boolean {
  return allowed.includes(origin) || LOCALHOST_ORIGIN.test(origin);
}

/**
 * Browsers only: the Vercel web app gets `Access-Control-Allow-Origin` for its
 * exact origin. Requests without an Origin header (the ESP32, curl, the Android
 * app) don't need CORS and are unaffected. Not an authentication mechanism.
 */
export function corsMiddleware(allowed: readonly string[]): RequestHandler {
  return cors({
    origin: (origin, callback) => {
      callback(null, origin === undefined || isAllowedOrigin(origin, allowed));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Device-Key', 'X-Admin-Key'],
    maxAge: 600, // browsers may cache the preflight for 10 min
  });
}
