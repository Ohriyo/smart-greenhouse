// Read-only Semaphore setup check. Sends NO SMS and uses no credit.
// Usage: npm run sms:check      (at most once or twice a minute: Semaphore's limit)
// Reads SEMAPHORE_API_KEY / SEMAPHORE_SENDER_NAME / SMS_DRY_RUN / ALERT_PHONE_NUMBERS
// from the environment or backend/.env (no database needed).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePhoneList } from '../src/sms/phone.js';
import { checkSemaphoreAccount } from '../src/sms/semaphoreAccount.js';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const apiKey = process.env.SEMAPHORE_API_KEY?.trim();
const senderName = process.env.SEMAPHORE_SENDER_NAME?.trim() || undefined;

if (!apiKey) {
  console.error(
    'SEMAPHORE_API_KEY is not set (backend/.env or the environment).\n' +
      'See docs/setup-sms.md (section 2) to get your key.',
  );
  process.exit(1);
}

const dryRun = (process.env.SMS_DRY_RUN?.trim() || 'true') !== 'false';
const phones = parsePhoneList(process.env.ALERT_PHONE_NUMBERS ?? '');
console.log(
  `SMS_DRY_RUN=${String(dryRun)}${dryRun ? ' (nothing is sent: set it to "false" for real SMS)' : ''}`,
);
if (phones.invalidPositions.length) {
  console.log(
    `[ FAIL ] ALERT_PHONE_NUMBERS entry ${phones.invalidPositions.join(', ')} is invalid`,
  );
} else {
  console.log(`[  OK  ] ALERT_PHONE_NUMBERS: ${phones.numbers.length} number(s)`);
}

const result = await checkSemaphoreAccount({ apiKey, senderName });

const mark = { ok: '  OK  ', warn: ' WARN ', error: ' FAIL ' } as const;
for (const line of result.lines) console.log(`[${mark[line.level]}] ${line.text}`);
const ok = result.ok && phones.invalidPositions.length === 0 && phones.numbers.length > 0;
console.log(
  ok
    ? '\nReady. Send one real test SMS with POST /api/alerts/test (X-Admin-Key), see docs/setup-sms.md.'
    : '\nFix the items marked FAIL (and set ALERT_PHONE_NUMBERS), then run it again.',
);
process.exit(ok ? 0 : 1);
