import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { DeviceIdSchema } from '../domain/schemas.js';

// backend/.env (local development). Variables that are already set (Render's
// environment, the test runner) win: loadEnvFile never overrides them.
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** An empty value ("KEY=" in .env or a blank field on Render) counts as not set. */
function blankToUndefined(v: unknown): unknown {
  return typeof v === 'string' && v.trim() === '' ? undefined : v;
}
const optionalString = (schema: z.ZodString) =>
  z.preprocess(blankToUndefined, schema.optional());
const flag = (fallback: 'true' | 'false') =>
  z
    .preprocess(blankToUndefined, z.enum(['true', 'false']).default(fallback))
    .transform((v) => v === 'true');

/**
 * CORS_ORIGIN: comma-separated browser origins allowed to call the API, e.g.
 * "https://etanim.vercel.app". localhost origins are always allowed (development).
 */
const OriginListSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .default('')
    .transform((raw, ctx) => {
      const origins = raw
        .split(',')
        .map((o) => o.trim().replace(/\/+$/, ''))
        .filter(Boolean);
      for (const o of origins) {
        let ok: boolean;
        try {
          const u = new URL(o);
          ok = (u.protocol === 'https:' || u.protocol === 'http:') && u.origin === o;
        } catch {
          ok = false;
        }
        if (!ok) {
          ctx.addIssue({
            code: 'custom',
            message: `"${o}" is not an origin. Use e.g. https://my-app.vercel.app (no path)`,
          });
          return z.NEVER;
        }
      }
      return origins;
    }),
);

const EnvSchema = z.object({
  NODE_ENV: z.preprocess(
    blankToUndefined,
    z.enum(['development', 'production', 'test']).default('development'),
  ),
  /** HTTP + Socket.IO port. Render sets it; locally 4000. */
  PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(65535).default(4000)),
  /** PostgreSQL (Neon in production). TLS is enforced for non-local hosts (src/db.ts). */
  DATABASE_URL: z
    .string({ error: 'is required (the PostgreSQL connection string)' })
    .regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// connection string (Neon or local)'),
  /** Shared secret the ESP32 sends as X-Device-Key with every reading. */
  DEVICE_API_KEY: z
    .string({ error: 'is required: the key the ESP32 sends as X-Device-Key' })
    .min(16, 'must be at least 16 characters (use a long random string)'),
  CORS_ORIGIN: OriginListSchema,
  /** Device used when a reading or a query names none (single greenhouse). */
  DEFAULT_DEVICE_ID: z.preprocess(blankToUndefined, DeviceIdSchema.default('gh-01')),
  /** Fallback offline timeout for devices that don't report `intervalSec`. */
  OFFLINE_AFTER_SEC: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(10).max(86_400).default(90),
  ),
  /** Minimum minutes between two breach alerts of the same metric (unless severity rises). */
  ALERT_COOLDOWN_MIN: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0).max(1440).default(15),
  ),
  /** Raw readings older than this are deleted daily (the 30-day history needs 30). */
  READINGS_RETENTION_DAYS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).max(3650).default(30),
  ),
  /** Only needed if "Enhanced push security" is turned on for the Expo project. */
  EXPO_ACCESS_TOKEN: optionalString(z.string().min(1)),
  /** Set to "false" to stop sending push notifications (alerts still appear in the app). */
  PUSH_ENABLED: flag('true'),
  /**
   * SMS alerts to the owner (docs/setup-sms.md). "console" = test mode: messages are
   * only written to the backend log, nothing is sent and nothing costs credit.
   */
  SMS_PROVIDER: z.preprocess(blankToUndefined, z.enum(['console', 'semaphore']).default('console')),
  /** Secret. Only needed with SMS_PROVIDER=semaphore. Never commit it. */
  SEMAPHORE_API_KEY: optionalString(z.string().min(1)),
  /** Sender name registered with Semaphore; empty = your account's default. */
  SEMAPHORE_SENDER_NAME: optionalString(z.string().min(1).max(11)),
  /** Safety limit: at most this many alert SMS per rolling 24 hours (test SMS excluded). */
  SMS_DAILY_CAP: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(200).default(10)),
  /**
   * Dev-only "Presentation tools" of the app (heat-wave / dry-soil scenarios for the
   * simulator). Keep it off (the default) except when demonstrating: when false the
   * /api/dev routes don't exist.
   */
  DEV_TOOLS: flag('false'),
});

const parsed = EnvSchema.superRefine((e, ctx) => {
  if (e.SMS_PROVIDER === 'semaphore' && e.SEMAPHORE_API_KEY === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['SEMAPHORE_API_KEY'],
      message: 'is required when SMS_PROVIDER=semaphore',
    });
  }
}).safeParse(process.env);

if (!parsed.success) {
  // Never print the values themselves: they may be secrets.
  console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
