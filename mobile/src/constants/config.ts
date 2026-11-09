import { z } from 'zod';

const ApiUrlSchema = z.url({ protocol: /^https?$/ }).transform((u) => u.replace(/\/+$/, '')); // no trailing slash

// Must be written exactly as `process.env.EXPO_PUBLIC_API_URL`: Expo inlines it at build time.
const parsed = ApiUrlSchema.safeParse(process.env.EXPO_PUBLIC_API_URL);

/**
 * Backend base URL from mobile/.env (e.g. "http://192.168.1.50:4000"), or null
 * when missing/invalid. The Settings screen will be able to override it later.
 */
export const DEFAULT_API_URL: string | null = parsed.success ? parsed.data : null;
