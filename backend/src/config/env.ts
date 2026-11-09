import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Absolute path of the backend/ folder (works from both src/ and dist/). */
export const BACKEND_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const EnvSchema = z.object({
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
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
