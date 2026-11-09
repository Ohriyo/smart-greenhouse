// Read-only Semaphore setup check. Sends NO SMS.
// Usage: npm run sms:check      (run it at most once or twice a minute: Semaphore's limit)
import { env } from '../src/config/env.js';
import { checkSemaphoreAccount } from '../src/sms/semaphoreAccount.js';

if (!env.SEMAPHORE_API_KEY) {
  console.error(
    'SEMAPHORE_API_KEY is not set in backend/.env.\nSee docs/setup-sms.md (section 2) to get your key.',
  );
  process.exit(1);
}

console.log(
  `SMS_PROVIDER=${env.SMS_PROVIDER}${env.SMS_PROVIDER === 'console' ? ' (test mode: set it to "semaphore" to send real SMS)' : ''}`,
);
const result = await checkSemaphoreAccount({
  apiKey: env.SEMAPHORE_API_KEY,
  senderName: env.SEMAPHORE_SENDER_NAME,
});

const mark = { ok: '  OK  ', warn: ' WARN ', error: ' FAIL ' } as const;
for (const line of result.lines) console.log(`[${mark[line.level]}] ${line.text}`);
console.log(
  result.ok
    ? '\nReady. Use "Send test SMS" in the app (Settings → SMS alerts).'
    : '\nFix the items marked FAIL, then run it again.',
);
process.exit(result.ok ? 0 : 1);
