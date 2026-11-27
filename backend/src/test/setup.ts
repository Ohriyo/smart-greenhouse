/**
 * Environment for the database-backed tests. Import it FIRST (directly or via
 * ./server.ts): ES modules run imports in order, so the app's config (src/config/env.ts)
 * then sees exactly these values.
 *
 * Needs TEST_DATABASE_URL, from backend/.env.test (see .env.test.example) or the
 * environment: an EMPTY PostgreSQL database whose name contains "test", because
 * the tests delete every row in it. Without it the database tests are skipped.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TEST_DEVICE_KEY = 'test-device-key-0123456789';
export const TEST_ADMIN_KEY = 'test-admin-key-0123456789';
export const TEST_ORIGIN = 'https://greenhouse-test.vercel.app';
export const TEST_NUMBERS = ['09171234567', '09187654321'];

const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
const envTestFile = `${backendRoot}.env.test`;
if (existsSync(envTestFile)) process.loadEnvFile(envTestFile);

const testUrl = process.env.TEST_DATABASE_URL?.trim() || undefined;

/** Why the database tests are skipped, or false when they can run. */
export const dbSkip: string | false = testUrl
  ? false
  : 'TEST_DATABASE_URL is not set: create backend/.env.test (see .env.test.example)';

if (testUrl) {
  const dbName = decodeURIComponent(new URL(testUrl).pathname.replace(/^\//, ''));
  if (!/test/i.test(dbName)) {
    throw new Error(
      `Refusing to run the tests on database "${dbName}": its name must contain "test" ` +
        '(the tests delete every row).',
    );
  }
}

// Set everything the app reads, so backend/.env can never leak into a test run
// (loadEnvFile never overrides a variable that is already set).
const placeholderUrl = 'postgresql://skipped:skipped@127.0.0.1:1/skipped_test'; // never connected
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: testUrl ?? placeholderUrl,
  DIRECT_URL: testUrl ?? placeholderUrl,
  DEVICE_API_KEY: TEST_DEVICE_KEY,
  ADMIN_API_KEY: TEST_ADMIN_KEY,
  CORS_ORIGIN: TEST_ORIGIN,
  DEFAULT_DEVICE_ID: 'gh-01',
  OFFLINE_AFTER_SEC: '90',
  ALERT_COOLDOWN_MINUTES: '30',
  READINGS_RETENTION_DAYS: '30',
  PUSH_ENABLED: 'false',
  EXPO_ACCESS_TOKEN: '',
  SMS_DRY_RUN: 'true',
  ALERT_PHONE_NUMBERS: TEST_NUMBERS.join(','),
  SMS_PROVIDER: 'textbee',
  TEXTBEE_API_KEY: '',
  TEXTBEE_DEVICE_ID: '',
  TEXTBEE_SIM_SLOT: '',
  SEMAPHORE_API_KEY: '',
  SEMAPHORE_SENDER_NAME: '',
  SMS_DAILY_CAP: '10',
  SMS_OFFLINE_AFTER_MINUTES: '10',
  DEV_TOOLS: 'false',
  LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'error',
  LOG_FORMAT: 'text',
});

/** Applies the Prisma migrations to the test database (idempotent; ~2 s). */
export function migrateTestDb(): void {
  if (!testUrl) return;
  execFileSync(
    process.execPath,
    [`${backendRoot}node_modules/prisma/build/index.js`, 'migrate', 'deploy'],
    { cwd: backendRoot, env: process.env, stdio: 'pipe' },
  );
}
