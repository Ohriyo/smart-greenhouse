# SMS alerts

The **backend** texts every number in `ALERT_PHONE_NUMBERS` through [Semaphore](https://semaphore.co) (a Philippine SMS service) when a reading crosses a threshold, once more when it is back to normal, and when the greenhouse goes offline. The exact rules and texts are in [api-contract.md §7](api-contract.md). Everything is set in the server environment (Render → your service → **Environment**, or `backend/.env` locally); the app only shows the status (Settings → SMS alerts) and the SMS result of each alert.

> **Limits to know about**
> - The SMS is sent by the backend. If the backend can't run (Render suspended, database down) or has no internet, no SMS is sent. The ESP32 keeps reading its sensors.
> - Every message costs credit. A daily cap (`SMS_DAILY_CAP`, default 10 per rolling 24 h) protects you from a surprise bill; test SMS don't count toward it.

## 1. Dry run first (free, the default)

With `SMS_DRY_RUN=true` the backend does everything except calling Semaphore: each SMS is recorded with status `dry_run` and logged as `[dry run, not sent] SMS to 091••••4567: "…"`. No key needed, no credit used.

1. Set `ALERT_PHONE_NUMBERS`, e.g. `09171234567,09181234567` (also accepted: `+639…`, `639…`, `9…`, with spaces or dashes). An invalid entry stops the backend at startup and names its position (never the number).
2. Trigger a crossing: with the simulator (`npm run sim -- --hot` in `backend/`, locally) or by lowering a limit in the app (Control → Sensor limits).
3. The app's Alerts tab shows "SMS dry run (not sent)" on the alert; Settings → SMS alerts lists the recent attempts.

## 2. Real SMS with Semaphore

1. **Account and credit:** create an account at semaphore.co and add credit. Check their current pricing and sender-name rules there. One credit = one SMS of up to 160 characters; ours stay under 160 (plain ASCII, so temperatures read `36C`).
2. **API key:** copy it from your Semaphore account. It's a secret: it goes only into the server environment, never into the app, git, chats or screenshots.
3. **Sender name:** Semaphore sends from a *registered* sender name. If your account has a default one, you can leave `SEMAPHORE_SENDER_NAME` empty; otherwise register one (max 11 characters) and set it.
4. **Set the environment** (Render → Environment → edit, then save; Render redeploys):

   | Variable | Value |
   |---|---|
   | `ALERT_PHONE_NUMBERS` | `09171234567,09181234567` |
   | `SEMAPHORE_API_KEY` | your key |
   | `SEMAPHORE_SENDER_NAME` | your registered name (optional) |
   | `SMS_DRY_RUN` | `false` |

   With `SMS_DRY_RUN=false` and no key the backend refuses to start and says why.
5. **Check the account without sending anything** (locally, with the same values in `backend/.env`): `npm run sms:check` in `backend/`. It asks Semaphore whether the key works, how much credit is left and which sender names are registered. No SMS, no cost (limited to 2 checks per minute).
6. **Send one real test SMS** to every number (needs the admin key, Render → Environment → `ADMIN_API_KEY`):
   ```powershell
   curl.exe -X POST -H "X-Admin-Key: <ADMIN_API_KEY>" https://<your-service>.onrender.com/api/alerts/test
   ```
   Answer `"status":"sent"` = Semaphore accepted it (delivery to the phone isn't confirmed; check the phone). `"failed"` shows Semaphore's answer in `providerResponse`. At most 5 test SMS per hour.

## How it behaves

- **Any crossing:** above the max or below the min, warning or critical, texts once: `[Greenhouse] Soil moisture LOW: 18% (min 30%) at 14:32` (Asia/Manila time).
- **Cooldown:** the same sensor + condition (e.g. air temp HIGH) is not texted again within `ALERT_COOLDOWN_MINUTES` (default 30). A crossing inside the cooldown is recorded as `skipped_cooldown`.
- **Back to normal:** one SMS after a texted HIGH/LOW: `[Greenhouse] Soil moisture back to normal: 35% at 15:02`.
- **Offline:** after `SMS_OFFLINE_AFTER_MINUTES` (default 10) without data, and one SMS when readings return.
- **Every attempt is stored** (sent / failed / skipped_cooldown / skipped_daily_cap / dry_run) with Semaphore's answer (key removed, numbers masked).
- **Never blocks a reading:** the SMS is sent after the reading is stored; a Semaphore timeout (10 s) is retried once, then recorded as failed.

## Troubleshooting

The app (Settings → SMS alerts, or the alert's details) shows the last result; the Render log has the full reason.

| Message | Meaning / fix |
|---|---|
| Backend won't start: `ALERT_PHONE_NUMBERS … position 2` | That entry isn't a PH mobile number (09XXXXXXXXX) |
| Backend won't start: `SEMAPHORE_API_KEY is required when SMS_DRY_RUN=false` | Set the key, or go back to `SMS_DRY_RUN=true` |
| `failed` with `HTTP 401` / `rejected: …` | Wrong key, or the sender name isn't registered/active |
| `failed` with `no answer within 10 s` | Semaphore slow or unreachable; retried once. Note: if Semaphore had accepted the first try, the SMS can arrive twice |
| `Failed` / `Refunded` in the provider answer | The network couldn't deliver it (wrong number, phone off too long) |
| `skipped_daily_cap` | The cap was hit. Raise `SMS_DAILY_CAP` or wait (rolling 24 h) |
| Test SMS: `409 SMS_NOT_CONFIGURED` | `ALERT_PHONE_NUMBERS` is empty |
| Test SMS: `401` / `503 NOT_CONFIGURED` | Wrong `X-Admin-Key` / no `ADMIN_API_KEY` on the server |
| Status `dry_run`, nothing arrives | `SMS_DRY_RUN` is still `true` |
| A message starting with "TEST" never arrives | Semaphore silently drops those; ours never start with it |
