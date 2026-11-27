# SMS alerts

The **backend** texts every number in `ALERT_PHONE_NUMBERS` when a reading crosses a threshold, once more when it is back to normal, and when the greenhouse goes offline. The exact rules and texts are in [api-contract.md §7](api-contract.md). Everything is set in the server environment (Render → your service → **Environment**, or `backend/.env` locally). The app only shows the status (Settings → SMS alerts) and the SMS result of each alert.

Who sends the SMS is set by `SMS_PROVIDER`:
- **`textbee`** (the default, [textbee.dev](https://textbee.dev)): an Android phone with the textbee app sends the SMS from **its own SIM**. Free plan: 1 phone, 50 SMS a day, 300 a month; the SIM's own rates apply (a text promo keeps it cheap). The SMS comes from that phone's number.
- **`semaphore`** ([semaphore.co](https://semaphore.co)): a paid Philippine SMS service with a registered sender name ([section 4](#4-alternative-semaphore)).

> **Limits to know about**
> - The SMS is sent by the backend through the provider. If the backend can't run (Render suspended, database down) no SMS is sent; the ESP32 keeps reading its sensors.
> - With textbee the **phone is a single point of failure**: off, offline, asleep, no signal or no load → the SMS waits (until the phone wakes) or fails.
> - A daily cap (`SMS_DAILY_CAP`, default 10 per rolling 24 h) protects the SIM's load and textbee's free plan; test SMS don't count toward it.

## 1. Dry run first (free, the default)

With `SMS_DRY_RUN=true` the backend does everything except calling the provider: each SMS is recorded with status `dry_run` and logged as `[dry run, not sent] SMS to 091••••4567: "…"`. No key needed.

1. Set `ALERT_PHONE_NUMBERS`, e.g. `09171234567,09181234567` (also accepted: `+639…`, `639…`, `9…`, with spaces or dashes). An invalid entry stops the backend at startup and names its position (never the number).
2. Trigger a crossing: with the simulator (`npm run sim -- --hot` in `backend/`, locally) or by lowering a limit in the app (Control → Sensor limits).
3. The app's Alerts tab shows "SMS dry run (not sent)" on the alert; Settings → SMS alerts lists the recent attempts.

## 2. Real SMS with textbee

**You need** an Android phone (Android 7 or newer, ideally a spare one) with a SIM that has load or an SMS promo and internet (Wi-Fi is fine; the SIM still needs signal). Avoid a phone that receives bank or one-time codes: the app can upload received texts to textbee.

1. **Account:** register at <https://app.textbee.dev/register> and **click the link in the verification email**. Sending fails (HTTP 400) until the email is verified.
2. **App:** on the phone open <https://textbee.dev/download> → **Download APK** (it isn't on the Play Store). Allow *Install unknown apps* for the browser; if Play Protect warns that the app wasn't scanned, textbee's instructions are **More details → Install anyway**.
   - Android 15+: if the SMS permission is greyed out, long-press the textbee icon → **App info** → **⋮** → **Allow restricted settings**, then **Permissions → SMS → Allow**.
3. **Link the phone:** in the dashboard (<https://app.textbee.dev/dashboard>) **Add a device → Continue** shows a QR code. In the app: **Get Started → Scan QR Code** → name it → **Register Device** → allow the permissions → **Continue**. The app shows **"You're all set!"** and the **Device ID**.
4. **API key:** dashboard → **API Keys → Generate API Key** → copy it (shown **once**). It's a secret: only the server environment, never the app, git, chats or screenshots.
5. **Keep the phone awake** (textbee's guide: <https://textbee.dev/docs/troubleshooting/keep-the-phone-online>): App battery usage **Unrestricted**, notifications allowed, **Sticky notification** on in the app, battery saver off, phone plugged in, never force-stop or "clear all" the app. Samsung, Xiaomi, OPPO, vivo and others need extra steps (in the guide). Turn **receiving SMS** off in the app if you don't need it: received texts count toward the free plan.
6. **Set the environment** (`backend/.env` locally; Render → Environment → edit, save, Render redeploys):

   | Variable | Value |
   |---|---|
   | `SMS_PROVIDER` | `textbee` (the default) |
   | `ALERT_PHONE_NUMBERS` | `09171234567,09181234567` (the people to text, not the sending phone) |
   | `TEXTBEE_API_KEY` | your key |
   | `TEXTBEE_DEVICE_ID` | the Device ID (recommended; empty = textbee picks the phone) |
   | `TEXTBEE_SIM_SLOT` | dual-SIM only: `0` = SIM 1, `1` = SIM 2 (empty = the phone's default SIM) |
   | `SMS_DRY_RUN` | `false` |

   With `SMS_DRY_RUN=false` and no key the backend refuses to start and says why.
7. **Check without sending anything** (locally, with the same values in `backend/.env`):
   ```powershell
   cd backend
   npm run sms:check
   ```
   It asks textbee whether the key works and the phone is linked, enabled, recently heard from, not battery-restricted, and has signal. No SMS, no cost.
8. **Send one real test SMS** to every number (needs the admin key, Render → Environment → `ADMIN_API_KEY`):
   ```powershell
   curl.exe -X POST -H "X-Admin-Key: <ADMIN_API_KEY>" https://<your-service>.onrender.com/api/alerts/test
   ```
   Answer `"status":"sent"` = textbee queued it on the phone (check the receiving phone; textbee's dashboard → Messaging → History shows its progress). `"failed"` shows the reason in `providerResponse`. At most 5 test SMS per hour. **Repeat once with the sending phone locked for 15+ minutes** to prove the battery settings work.

## 3. How it behaves

- **Any crossing:** above the max or below the min, warning or critical, texts once: `[Greenhouse] Soil moisture LOW: 18% (min 30%) at 14:32` (Asia/Manila time).
- **Cooldown:** the same sensor + condition (e.g. air temp HIGH) is not texted again within `ALERT_COOLDOWN_MINUTES` (default 30). A crossing inside the cooldown is recorded as `skipped_cooldown`.
- **Back to normal:** one SMS after a texted HIGH/LOW: `[Greenhouse] Soil moisture back to normal: 35% at 15:02`.
- **Offline:** after `SMS_OFFLINE_AFTER_MINUTES` (default 10) without data, and one SMS when readings return.
- **Every attempt is stored** (sent / failed / skipped_cooldown / skipped_daily_cap / dry_run) with the provider's answer (key removed, numbers masked).
- **Never blocks a reading:** the SMS is sent after the reading is stored; a provider timeout (10 s) is retried once, then recorded as failed.

## 4. Alternative: Semaphore

A paid service (per SMS) that sends from a registered sender name instead of a phone. Create an account at semaphore.co, add credit, register a sender name (max 11 characters; their FAQ says approval takes up to 5 business days and a send without a registered name fails), copy the API key, then set `SMS_PROVIDER=semaphore`, `SEMAPHORE_API_KEY`, optionally `SEMAPHORE_SENDER_NAME`, and `SMS_DRY_RUN=false`. `npm run sms:check` then checks the key, the credit and the sender names (Semaphore allows it about once a minute). Messages starting with "TEST" are silently dropped by Semaphore; ours never start with it.

## Troubleshooting

The app (Settings → SMS alerts, or the alert's details) shows the last result; the Render log has the full reason.

| Message | Meaning / fix |
|---|---|
| Backend won't start: `ALERT_PHONE_NUMBERS … position 2` | That entry isn't a PH mobile number (09XXXXXXXXX) |
| Backend won't start: `TEXTBEE_API_KEY is required when SMS_DRY_RUN=false` | Set the key, or go back to `SMS_DRY_RUN=true` |
| `HTTP 401 … TEXTBEE_API_KEY is wrong or was revoked` | Generate a new key in the dashboard, update the environment |
| `HTTP 400 … No enabled device found` / email not verified | Enable the phone in the dashboard; verify the textbee email |
| `HTTP 404 … TEXTBEE_DEVICE_ID` | The Device ID isn't on this account: copy it again from the dashboard |
| `HTTP 429 … plan limit` | textbee's free 50/day or 300/month is used up; wait or lower the SMS volume |
| `sent`, but nothing arrives | The phone is asleep, offline or out of load: check textbee's Messaging → History (stuck at `pending`) and the phone's battery settings |
| `warning: SMS_PERMISSION_MISSING` | The app lost the SMS permission: allow it again (Android 15+: "Allow restricted settings" first) |
| `failed` with `no answer within 10 s` | textbee slow or unreachable; retried once. If textbee had accepted the first try, the SMS can arrive twice |
| `skipped_daily_cap` | The cap was hit. Raise `SMS_DAILY_CAP` (keep it under textbee's 50/day) or wait (rolling 24 h) |
| Test SMS: `409 SMS_NOT_CONFIGURED` | `ALERT_PHONE_NUMBERS` is empty |
| Test SMS: `401` / `503 NOT_CONFIGURED` | Wrong `X-Admin-Key` / no `ADMIN_API_KEY` on the server |
| Status `dry_run`, nothing arrives | `SMS_DRY_RUN` is still `true` |
