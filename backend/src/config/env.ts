import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { DeviceIdSchema } from '../domain/schemas.js';
import { parsePhoneList } from '../sms/phone.js';
import { SMS_PROVIDERS } from '../sms/provider.js';

// backend/.env (local development). Variables that are already set (Render's
// environment, the test runner) win: loadEnvFile never overrides them.
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** An empty value ("KEY=" in .env or a blank field on Render) counts as not set. */
function blankToUndefined(v: unknown): unknown {
  return typeof v === 'string' && v.trim() === '' ? undefined : v;
}
const optionalString = (schema: z.ZodString) => z.preprocess(blankToUndefined, schema.optional());
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

/**
 * ALERT_PHONE_NUMBERS: Philippine mobile numbers, comma-separated, any common form
 * (0917…, +63917…). Normalized to 09XXXXXXXXX. An invalid entry stops the server
 * with its position (never the number itself: it is personal data).
 */
const PhoneListSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .default('')
    .transform((raw, ctx) => {
      const { numbers, invalidPositions } = parsePhoneList(raw);
      if (invalidPositions.length > 0) {
        ctx.addIssue({
          code: 'custom',
          message:
            `entry ${invalidPositions.join(', ')} is not a Philippine mobile number ` +
            '(use 09XXXXXXXXX or +639XXXXXXXXX, comma-separated)',
        });
        return z.NEVER;
      }
      return numbers;
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
  /**
   * MQTT broker (docs/setup-emqx.md), e.g. mqtts://xxxx.ala.asia-southeast1.emqxsl.com:8883.
   * Empty = MQTT off: readings only arrive over HTTPS (POST /api/readings).
   */
  MQTT_URL: optionalString(
    z
      .string()
      .regex(
        /^(mqtts?|wss?):\/\/[^\s/?#]+/,
        'must be a broker URL like mqtts://<your-deployment>.emqxsl.com:8883',
      ),
  ),
  /** The backend's own broker login (EMQX → Access Control → Authentication). */
  MQTT_USERNAME: optionalString(z.string().min(1)),
  /** Secret. */
  MQTT_PASSWORD: optionalString(z.string().min(1)),
  CORS_ORIGIN: OriginListSchema,
  /** Device used when a reading or a query names none (single greenhouse). */
  DEFAULT_DEVICE_ID: z.preprocess(blankToUndefined, DeviceIdSchema.default('gh-01')),
  /** Fallback offline timeout for devices that don't report `intervalSec`. */
  OFFLINE_AFTER_SEC: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(10).max(86_400).default(90),
  ),
  /**
   * No repeat SMS for the same sensor+condition within this many minutes; also the
   * minimum gap between two in-app alerts of one metric (unless severity rises).
   */
  ALERT_COOLDOWN_MINUTES: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0).max(1440).default(30),
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
   * Shared secret for admin-only endpoints (POST /api/alerts/test) as X-Admin-Key.
   * Required in production.
   */
  ADMIN_API_KEY: optionalString(
    z.string().min(16, 'must be at least 16 characters (use a long random string)'),
  ),
  /**
   * SMS alerts (docs/setup-sms.md). true (the default) = every SMS is recorded and
   * logged as "dry_run" and the provider is never called: no credit is used.
   */
  SMS_DRY_RUN: flag('true'),
  /** Who gets the SMS alerts. Empty = no SMS at all. */
  ALERT_PHONE_NUMBERS: PhoneListSchema,
  /** Who sends the SMS: textbee (an Android phone's SIM, the default) or semaphore. */
  SMS_PROVIDER: z.preprocess(blankToUndefined, z.enum(SMS_PROVIDERS).default('textbee')),
  /** textbee API key (secret). Required when SMS_PROVIDER=textbee and SMS_DRY_RUN=false. */
  TEXTBEE_API_KEY: optionalString(z.string().min(1)),
  /** The phone's Device ID (textbee app or dashboard); empty = textbee's default phone. */
  TEXTBEE_DEVICE_ID: optionalString(
    z
      .string()
      .regex(
        /^[A-Za-z0-9_-]{1,64}$/,
        'must be the Device ID shown in the textbee app or dashboard',
      ),
  ),
  /** SIM to send from on a dual-SIM phone: 0 = SIM 1, 1 = SIM 2; empty = the phone's default. */
  TEXTBEE_SIM_SLOT: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(0).max(7).optional(),
  ),
  /** Semaphore API key (secret). Required when SMS_PROVIDER=semaphore and SMS_DRY_RUN=false. */
  SEMAPHORE_API_KEY: optionalString(z.string().min(1)),
  /** Sender name registered with Semaphore; empty = your account's default. */
  SEMAPHORE_SENDER_NAME: optionalString(z.string().min(1).max(11)),
  /** Safety limit: at most this many alert SMS per rolling 24 hours (test SMS excluded). */
  SMS_DAILY_CAP: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).max(200).default(10),
  ),
  /** Text "greenhouse offline" after this many minutes without readings. */
  SMS_OFFLINE_AFTER_MINUTES: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).max(1440).default(10),
  ),
  /**
   * Dev-only "Presentation tools" of the app (heat-wave / dry-soil scenarios for the
   * simulator). Keep it off (the default) except when demonstrating: when false the
   * /api/dev routes don't exist.
   */
  DEV_TOOLS: flag('false'),
});

const parsed = EnvSchema.superRefine((e, ctx) => {
  if (!e.SMS_DRY_RUN) {
    const key = e.SMS_PROVIDER === 'textbee' ? 'TEXTBEE_API_KEY' : 'SEMAPHORE_API_KEY';
    if (e[key] === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `is required when SMS_DRY_RUN=false (real SMS) with SMS_PROVIDER=${e.SMS_PROVIDER}`,
      });
    }
  }
  if (
    e.MQTT_URL !== undefined &&
    (e.MQTT_USERNAME === undefined) !== (e.MQTT_PASSWORD === undefined)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: [e.MQTT_USERNAME === undefined ? 'MQTT_USERNAME' : 'MQTT_PASSWORD'],
      message: 'set both MQTT_USERNAME and MQTT_PASSWORD (or neither)',
    });
  }
  if (e.MQTT_URL !== undefined && /^\w+:\/\/[^/]*@/.test(e.MQTT_URL)) {
    ctx.addIssue({
      code: 'custom',
      path: ['MQTT_URL'],
      message: 'must not contain the login: use MQTT_USERNAME and MQTT_PASSWORD',
    });
  }
  if (e.NODE_ENV === 'production' && e.ADMIN_API_KEY === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['ADMIN_API_KEY'],
      message: 'is required in production (protects POST /api/alerts/test)',
    });
  }
  // The .env.example placeholders must never protect a real deployment.
  if (e.NODE_ENV === 'production') {
    for (const key of ['DEVICE_API_KEY', 'ADMIN_API_KEY'] as const) {
      if (e[key]?.startsWith('change-me')) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'still has the .env.example placeholder: set a long random value',
        });
      }
    }
  }
}).safeParse(process.env);

if (!parsed.success) {
  // Never print the values themselves: they may be secrets.
  console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
