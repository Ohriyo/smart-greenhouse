import { z } from 'zod';

const ApiUrlSchema = z.url({ protocol: /^https?$/ }).transform((u) => u.replace(/\/+$/, '')); // no trailing slash

/** An http(s) base URL without trailing slash, or null when missing or invalid. */
export function parseApiUrl(raw: unknown): string | null {
  const parsed = ApiUrlSchema.safeParse(typeof raw === 'string' ? raw.trim() : raw);
  return parsed.success ? parsed.data : null;
}

/**
 * The backend base URL, fixed at build time by EXPO_PUBLIC_API_URL: mobile/.env
 * for local development, the EAS build profile for the APK, the Vercel project
 * settings for the web build. null when missing or invalid: the app then says
 * so instead of guessing an address.
 */
// Must be written exactly as `process.env.EXPO_PUBLIC_API_URL`: Expo inlines it at build time.
export const API_URL: string | null = parseApiUrl(process.env.EXPO_PUBLIC_API_URL);

/** How often the newest reading is fetched (also while the live socket works). */
export const LATEST_POLL_MS = 10_000;

/** A newest reading older than this gets the "Stale data" badge. */
export const STALE_READING_MS = 2 * 60_000;

/** Loading longer than this shows "Waking up server…" (free hosting sleeps when idle). */
export const WAKING_HINT_AFTER_MS = 3_000;
