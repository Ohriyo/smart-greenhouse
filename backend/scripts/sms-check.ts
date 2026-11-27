// Read-only SMS setup check. Sends NO SMS and uses no credit.
// Usage: npm run sms:check
// Reads SMS_PROVIDER, SMS_DRY_RUN, ALERT_PHONE_NUMBERS and the provider's settings
// (TEXTBEE_* or SEMAPHORE_*) from the environment or backend/.env (no database needed).
// Semaphore allows its account endpoints 2 calls per minute: run it at most once a minute.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parsePhoneList } from '../src/sms/phone.js';
import { SMS_PROVIDERS } from '../src/sms/provider.js';
import { checkSemaphoreAccount } from '../src/sms/semaphoreAccount.js';
import { checkTextbeeAccount } from '../src/sms/textbeeAccount.js';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const read = (name: string) => process.env[name]?.trim() || undefined;

const providerParsed = z.enum(SMS_PROVIDERS).safeParse(read('SMS_PROVIDER') ?? 'textbee');
if (!providerParsed.success) {
  console.error(`SMS_PROVIDER must be one of: ${SMS_PROVIDERS.join(', ')}.`);
  process.exit(1);
}
const provider = providerParsed.data;
const keyName = provider === 'textbee' ? 'TEXTBEE_API_KEY' : 'SEMAPHORE_API_KEY';
const apiKey = read(keyName);
if (!apiKey) {
  console.error(
    `${keyName} is not set (backend/.env or the environment).\n` +
      'See docs/setup-sms.md to get your key.',
  );
  process.exit(1);
}

let simSlot: number | undefined;
const rawSlot = read('TEXTBEE_SIM_SLOT');
if (provider === 'textbee' && rawSlot !== undefined) {
  const slot = z.coerce.number().int().min(0).max(7).safeParse(rawSlot);
  if (!slot.success) {
    console.error('TEXTBEE_SIM_SLOT must be a whole number from 0 (SIM 1) to 7.');
    process.exit(1);
  }
  simSlot = slot.data;
}

const dryRun = (read('SMS_DRY_RUN') ?? 'true') !== 'false';
const phones = parsePhoneList(process.env.ALERT_PHONE_NUMBERS ?? '');
console.log(`SMS_PROVIDER=${provider}`);
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

const result =
  provider === 'textbee'
    ? await checkTextbeeAccount({ apiKey, deviceId: read('TEXTBEE_DEVICE_ID'), simSlot })
    : await checkSemaphoreAccount({ apiKey, senderName: read('SEMAPHORE_SENDER_NAME') });

const mark = { ok: '  OK  ', warn: ' WARN ', error: ' FAIL ' } as const;
for (const line of result.lines) console.log(`[${mark[line.level]}] ${line.text}`);
const ok = result.ok && phones.invalidPositions.length === 0 && phones.numbers.length > 0;
console.log(
  ok
    ? '\nReady. Send one real test SMS with POST /api/alerts/test (X-Admin-Key), see docs/setup-sms.md.'
    : '\nFix the items marked FAIL (and set ALERT_PHONE_NUMBERS), then run it again.',
);
process.exit(ok ? 0 : 1);
