# Smart Greenhouse (ETanim)

An ESP32 reads air temperature and humidity (DHT22), light (BH1750) and soil moisture (capacitive v1.2) and posts a reading every 30 s over HTTPS. A Node.js backend stores the readings in PostgreSQL, raises alerts, and texts the owner through Semaphore when a value crosses its limit. The ETanim app (Android APK and a web version) shows live values, history, alerts and the limits.

```
                     HTTPS POST /api/readings every 30 s (X-Device-Key)
 ESP32 (Wi-Fi) ─────────────────────────────────────────────┐
                                                            ▼
 Android app (EAS APK) ──┐  REST + Socket.IO   ┌──────────────────────────┐   SQL (TLS)   ┌──────────────┐
                         ├────────────────────►│ backend (Render, free)   │──────────────►│ Neon         │
 Web app (Vercel) ───────┘  (+ poll every 10 s)│ Node 24 · Express ·      │               │ PostgreSQL   │
                                               │ Prisma · rules engine    │               └──────────────┘
                                               └────┬───────────────┬─────┘
                                     SMS (HTTPS)    │               │  push (Android APK only)
                                   Semaphore ◄──────┘               └──► Expo Push → FCM → phone
```

| Folder | What |
|---|---|
| `backend/` | Node.js + TypeScript: `POST /api/readings`, rules engine, SMS, REST, Socket.IO, simulator, tests |
| `mobile/` | Expo (React Native) app for Android and the web |
| `firmware/` | ESP32 Arduino sketch `firmware/SmartGreenhouse/` (+ bring-up tests): [docs/firmware.md](docs/firmware.md) |
| `docs/` | [API contract](docs/api-contract.md) (single source of truth), [SMS setup](docs/setup-sms.md), [push setup](docs/setup-push.md), [firmware](docs/firmware.md), Postman collection |
| `render.yaml` | Render Blueprint for the backend |

## Environment variables

**Backend** (`backend/.env` locally, Render → Environment when deployed). Every variable is in `backend/.env.example`. The backend checks them at startup and stops with a clear message (never the values) if one is wrong.

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `DATABASE_URL` | yes | | PostgreSQL URL. Neon: the **pooled** string (`…-pooler…`, `?sslmode=require&channel_binding=require`). Any non-local host always uses verified TLS |
| `DIRECT_URL` | Neon | `DATABASE_URL` | Neon's **direct** string, used by migrations |
| `DEVICE_API_KEY` | yes | | Shared secret the ESP32 sends as `X-Device-Key` (≥ 16 characters) |
| `ADMIN_API_KEY` | in production | | `X-Admin-Key` for `POST /api/alerts/test` (the real test SMS) |
| `CORS_ORIGIN` | for the web app | | Browser origins allowed to call the API, comma-separated, e.g. `https://etanim.vercel.app` (localhost is always allowed) |
| `ALERT_PHONE_NUMBERS` | for SMS | empty = no SMS | PH mobiles, comma-separated: `09171234567,09181234567` |
| `SMS_DRY_RUN` | | `true` | `true` = record and log SMS, send nothing. `false` = real SMS |
| `SEMAPHORE_API_KEY` | if `SMS_DRY_RUN=false` | | Semaphore key (secret, server only) |
| `SEMAPHORE_SENDER_NAME` | | account default | Registered sender name (≤ 11 characters) |
| `ALERT_COOLDOWN_MINUTES` | | `30` | No repeat SMS for the same sensor + condition, and no new in-app alert for the same sensor, within this time |
| `SMS_DAILY_CAP` | | `10` | Real alert SMS per rolling 24 h |
| `SMS_OFFLINE_AFTER_MINUTES` | | `10` | "Greenhouse offline" SMS after this much silence |
| `PORT` | | `4000` | Render sets it |
| `NODE_ENV` | | `development` | Render sets `production`: JSON logs, no stack traces |
| `LOG_LEVEL` | | `info` | `debug` / `info` / `warn` / `error` |
| `DEFAULT_DEVICE_ID` | | `gh-01` | Device used when a reading has no `deviceId` |
| `OFFLINE_AFTER_SEC` | | `90` | Offline timeout for a device that never reported its interval |
| `READINGS_RETENTION_DAYS` | | `30` | Older raw readings are deleted daily |
| `PUSH_ENABLED`, `EXPO_ACCESS_TOKEN` | | `true`, none | Push notifications ([docs/setup-push.md](docs/setup-push.md)) |
| `DEV_TOOLS` | | `false` | Dev-only demo endpoints (simulator scenarios) |

**App:** `EXPO_PUBLIC_API_URL`, the backend's base URL, set at build time: `mobile/.env` locally, `mobile/eas.json` (preview profile) for the APK, Vercel → Environment Variables for the web app. **Firmware:** `firmware/SmartGreenhouse/secrets.h` (git-ignored; template `secrets.example.h`): `WIFI_SSID`, `WIFI_PASSWORD`, `SERVER_URL`, `DEVICE_KEY`.

No secret is in git: `.env`, `.env.*` (except the examples) and `secrets.h` are ignored.

## Run it locally (Windows, PowerShell)

Prerequisites: **Node.js 24** (`node -v`), and a PostgreSQL database: either PostgreSQL installed on the PC (create an empty database, e.g. `psql -U postgres -h localhost -c "CREATE DATABASE greenhouse;"`) or a free Neon project.

```powershell
cd backend
npm install                    # packages + Prisma client
Copy-Item .env.example .env    # then edit .env (see below)
npx prisma migrate deploy      # creates the tables
npm run dev                    # backend on http://localhost:4000
```

In `backend/.env` set at least `DATABASE_URL` (local: `postgresql://postgres:<password>@localhost:5432/greenhouse`; URL-encode special characters in the password) and `DEVICE_API_KEY` (generate one: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`).

```powershell
# second terminal: a simulated ESP32 that posts every 30 s (gh-01)
cd backend
npm run sim                    # options: npm run sim -- --help  (--hot, --dry, --interval 5, --url …)

# third terminal: the app
cd mobile
npm install
Copy-Item .env.example .env    # EXPO_PUBLIC_API_URL=http://<your-PC-IPv4>:4000 for a phone on the same Wi-Fi
npx expo start                 # scan the QR code (Expo Go or the development build); press w for the web version
```

## Tests and checks

| Where | Command | What |
|---|---|---|
| `backend` | `npm test` | Unit + HTTP + SMS tests (node:test). The database tests need `backend/.env.test` with `TEST_DATABASE_URL` pointing to an **empty** database whose name contains `test` (they delete its rows); without it they're skipped with a message. See `backend/.env.test.example` |
| `backend` | `npm run typecheck`, `npm run lint`, `npm run format:check` | Static checks |
| `mobile` | `npm test` | API client tests (base URL, timeout, errors) |
| `mobile` | `npm run typecheck`, `npm run lint`, `npm run check:buttons` | Static checks; every button must be the shared pill `<Button>` |
| `mobile` | `npx expo export --platform web` | The web build (output in `mobile/dist/`) |
| `firmware` | Arduino IDE → Verify | Compiles the sketch (needs `secrets.h`) |
| `docs/postman` | Postman → Import → Runner | Request collection with pass/fail tests |

## Deploy

Order: database → backend → web app → APK → firmware.

1. **Neon** (<https://neon.tech>): create a project, region **AWS Asia Pacific (Singapore)**. From **Connect** copy two connection strings: **pooled** (toggle *Connection pooling* on; host contains `-pooler`) and **direct** (toggle off).
2. **Render** (<https://render.com>): push this repo to GitHub, then **New → Blueprint** → pick the repo. Render reads `render.yaml` and asks for the `sync: false` values:
   - `DATABASE_URL` = the pooled string, `DIRECT_URL` = the direct string.
   - `CORS_ORIGIN`: leave empty for now (step 4). `ALERT_PHONE_NUMBERS`: your numbers, or empty. `SEMAPHORE_*`: empty while `SMS_DRY_RUN=true`.
   - `DEVICE_API_KEY` and `ADMIN_API_KEY` are generated. View them under the service's **Environment**.

   What `render.yaml` sets up: free plan, Singapore, root `backend`; build `npm ci --include=dev && npm run build && npx prisma migrate deploy` (the free plan has no pre-deploy step, so migrations run in the build); start `node dist/index.js`; health check `/health`; Node from `engines` (`>=22.13 <25`, i.e. Node 24). Without the Blueprint, create a Web Service with exactly these settings. Check: `https://<service>.onrender.com/health` → `{"status":"ok","db":"ok",…}`.
3. **Vercel** (<https://vercel.com>): **Add New → Project** → import the repo → **Root Directory** `mobile`, Framework Preset *Other* (build command and output directory come from `mobile/vercel.json`: `npx expo export --platform web` → `dist`, every path rewritten to the single page). Add the environment variable `EXPO_PUBLIC_API_URL` = `https://<service>.onrender.com` → Deploy. Changing the variable later needs a redeploy.
4. **CORS:** in Render, set `CORS_ORIGIN` to the Vercel production URL (e.g. `https://etanim.vercel.app`, no trailing slash). Preview deployments have other URLs: add them comma-separated if you use them.
5. **APK (EAS Build)**, in `mobile/`:
   ```powershell
   npx eas-cli login
   npx eas-cli init               # prints the project id: paste it into EAS_PROJECT_ID in app.config.ts
   # edit eas.json → build → preview → env → EXPO_PUBLIC_API_URL = https://<service>.onrender.com
   npx eas-cli build -p android --profile preview
   ```
   The build fails early if the URL is missing, the placeholder, or not HTTPS. When it's done, open the link on the phone and install the APK. Closed-app push also needs `google-services.json` and the FCM key ([docs/setup-push.md](docs/setup-push.md)); without them the APK works, just without push.
6. **Firmware:** `secrets.h` with your Wi-Fi, `SERVER_URL` = the Render URL and `DEVICE_KEY` = Render's `DEVICE_API_KEY`, then upload ([docs/firmware.md](docs/firmware.md)).
7. **SMS:** dry run first, then real SMS: [docs/setup-sms.md](docs/setup-sms.md).

## Pre-demo checklist

1. **Hotspot / Wi-Fi on** (2.4 GHz) and the ESP32 powered. The LED should be steady.
2. **Wake the backend ~2 min before:** open `https://<service>.onrender.com/health` and wait for `"db":"ok"` (the first request after 15 idle minutes takes about a minute; a powered ESP32 keeps it awake).
3. **ESP32 posting:** the app's Home shows "Updated … ago" under 30 s and no "Stale data" badge; Render → Logs show no `401`. Serial console `status` shows `posts ok` rising.
4. **SMS:** `SMS_DRY_RUN=false`, Semaphore credit left, then send one real test SMS and check it arrives:
   ```powershell
   curl.exe -X POST -H "X-Admin-Key: <ADMIN_API_KEY>" https://<service>.onrender.com/api/alerts/test
   ```
5. **Web app** opens without errors (CORS set); **APK** installed and showing live values.
6. To show an alert: lower a limit in Control → Sensor limits (e.g. max air temperature below the current value) → an alert appears with "SMS sent". Put the limit back afterwards (that sends one "back to normal" SMS).

## Limits and risks of the free setup

- **Render free:** sleeps after 15 min without traffic, ~1 min to wake. 750 free instance hours per workspace per month: one service running all month uses ~744 h, so a second free service in the same workspace can get both suspended. The filesystem is ephemeral (all data is in Neon).
- **Neon free:** the compute suspends when idle (first query ~1 s slower); monthly compute and storage limits apply. Check them in the Neon console.
- **Open endpoints:** reading data, changing limits, calibrating and marking alerts read need no login (single-user class project). Anyone with the URL can do that. Only posting readings (`X-Device-Key`) and the test SMS (`X-Admin-Key`) need a key.
- **Firmware TLS** doesn't verify the server certificate (`setInsecure()`); `uplink.cpp` shows how to pin the root CA.
- **SMS:** "sent" means Semaphore accepted it, not that the phone received it. A Semaphore timeout is retried once, so in rare cases an SMS can arrive twice.

## App UI notes

- **Button rule:** every button is a **pill**, made only with the shared `<Button>` (`mobile/src/components/ui/Button.tsx`); icon-only buttons are circles (`<IconButton>`). `npm run check:buttons` enforces it.
- **Connection states:** loading longer than 3 s shows "Waking up server…"; requests time out after 15 s with a **Retry** button; a newest reading older than 2 min shows a **Stale data** badge. The newest reading is fetched every 10 s, live updates also arrive over Socket.IO.
- **Web vs Android:** the web app has everything except closed-app push notifications.
- **Demo tools (development builds only):** the dark **Demo** pill opens presentation tools. Scenarios (heat wave, dry soil) drive the **simulator** only and need `DEV_TOOLS=true` on the backend. Release builds don't contain this code.
