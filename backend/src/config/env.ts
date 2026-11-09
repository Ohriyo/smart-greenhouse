import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Absolute path of the backend/ folder (works from both src/ and dist/). */
export const BACKEND_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MQTT_URL: z
      .string()
      .regex(/^mqtts?:\/\//, 'must start with mqtt:// or mqtts://')
      .default('mqtt://localhost:1883'),
    DATABASE_URL: z.string().min(1).default('file:./dev.db'),
    /** Fallback offline timeout for devices that don't report `intervalSec`. */
    OFFLINE_AFTER_SEC: z.coerce.number().int().min(10).max(86_400).default(90),
    /** Minimum minutes between two breach alerts of the same metric (unless severity rises). */
    ALERT_COOLDOWN_MIN: z.coerce.number().min(0).max(1440).default(15),
    /** Raw readings older than this are deleted daily (the 30-day history needs 30). */
    READINGS_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
    /** Only needed if "Enhanced push security" is turned on for the Expo project. */
    EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
    /** Set to "false" to stop sending push notifications (alerts still appear in the app). */
    PUSH_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    /**
     * SMS alerts to the owner (docs/setup-sms.md). "console" = test mode: messages are
     * only written to the backend log, nothing is sent and nothing costs credit.
     */
    SMS_PROVIDER: z.enum(['console', 'semaphore']).default('console'),
    /** Secret. Only needed with SMS_PROVIDER=semaphore. Never commit it. */
    SEMAPHORE_API_KEY: z.string().min(1).optional(),
    /** Sender name registered with Semaphore; empty = your account's default. */
    SEMAPHORE_SENDER_NAME: z.string().min(1).max(11).optional(),
    /**
     * Dev-only "Presentation tools" of the app (heat-wave / dry-soil scenarios for the
     * simulator). Keep it off (the default) except when demonstrating: when false the
     * /api/dev routes don't exist.
     */
    DEV_TOOLS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    /** Safety limit: at most this many alert SMS per rolling 24 hours (test SMS excluded). */
    SMS_DAILY_CAP: z.coerce.number().int().min(1).max(200).default(10),
  })
  .refine((e) => e.SMS_PROVIDER !== 'semaphore' || e.SEMAPHORE_API_KEY !== undefined, {
    path: ['SEMAPHORE_API_KEY'],
    message: 'is required when SMS_PROVIDER=semaphore',
  });

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
