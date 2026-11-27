# MQTT broker: EMQX Serverless

The ESP32 publishes its readings over **MQTT** to a hosted broker, **EMQX Serverless** (free tier), and the backend on Render subscribes to them. If the ESP32 can't reach the broker, it automatically sends the same readings over HTTPS (`POST /api/readings`). Topics, payloads and rules: [api-contract.md §4](api-contract.md).

```
ESP32 ──MQTT over TLS (8883)──► EMQX Serverless ──MQTT over TLS──► backend (Render)
  └────────── HTTPS fallback: POST /api/readings ───────────────────►┘
  └────────── HTTPS GET /health every 10 min (keeps Render awake) ───►┘
```

**Free tier** (EMQX's pricing page, Nov 2026): 1 million session minutes and 1 GB of traffic per month, with the spend limit left at **0**. This project uses about 90 000 session minutes (ESP32 + backend connected all month) and roughly 100–150 MB (one ~400-byte reading every 30 s, in and out, plus keep-alives). A simulator running all day adds about as much again.

> **Know about these:** if the quota runs out, EMQX **stops** the deployment until next month (restart it by hand in the console). A deployment with **no clients for 30 days** is stopped too, and deleted 30 days after that. Readings keep flowing over HTTPS while the broker is stopped, so you won't lose data, but the app then shows "HTTPS (MQTT fallback)".

## 1. Create the deployment

1. Sign up at <https://www.emqx.com/en/cloud> and open the **EMQX Cloud console**.
2. Create a project if asked, then **New Deployment** → **Serverless**.
3. Keep **Spend Limit = 0** (free quota only, no card needed).
4. Pick the region closest to the Philippines (e.g. Singapore, if offered), name it (e.g. `greenhouse`), accept the terms, **Deploy**. Wait until it shows **Running**.
5. Open it → **Overview**. Note the **Address** (looks like `xxxxxxxx.ala.asia-southeast1.emqxsl.com`) and the **MQTT over TLS/SSL port 8883**. Serverless has **no** plain port 1883.

## 2. Two logins: one for the ESP32, one for the backend

**Access Control → Authentication → Add**, twice:

| Username | Used by | Password goes into |
|---|---|---|
| `greenhouse-device` | the ESP32 | `firmware/SmartGreenhouse/secrets.h` → `MQTT_PASSWORD` |
| `greenhouse-backend` | the backend | Render → Environment → `MQTT_PASSWORD` (and `backend/.env` locally) |

Use long random passwords (e.g. `node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"` in PowerShell: Node prints a random string). They are secrets: never in git, the app, chats or screenshots. Two logins mean a leaked ESP32 password can't read or command anything except the ESP32's own topics (step 3).

## 3. Authorization (recommended)

EMQX allows every topic to every login by default. To restrict it, **Access Control → Authorization**:

1. **Username** tab → **Add** these rules (Permission **Allow**):

   | Username | Topic | Action |
   |---|---|---|
   | `greenhouse-device` | `greenhouse/gh-01/telemetry` | Publish |
   | `greenhouse-device` | `greenhouse/gh-01/status` | Publish |
   | `greenhouse-device` | `greenhouse/gh-01/command` | Subscribe |
   | `greenhouse-backend` | `greenhouse/+/telemetry` | Subscribe |
   | `greenhouse-backend` | `greenhouse/+/status` | Subscribe |
   | `greenhouse-backend` | `greenhouse/+/command` | Publish |

2. **All Users** tab → **Add**: Topic `#`, Action **Publish & Subscribe**, Permission **Deny**. This "deny everything else" rule turns the list above into a whitelist (EMQX checks Username rules first).

If you skip this step everything still works, just with less protection. If you add it and use another device id than `gh-01`, change the device rules to match. A refused subscription shows in the Render log as `broker refused the subscription …`.

## 4. Backend (Render)

Render → your service → **Environment** → add (then **Save**; Render redeploys):

| Variable | Value |
|---|---|
| `MQTT_URL` | `mqtts://<Address>:8883`, e.g. `mqtts://xxxxxxxx.ala.asia-southeast1.emqxsl.com:8883` |
| `MQTT_USERNAME` | `greenhouse-backend` |
| `MQTT_PASSWORD` | its password |

No certificate to install: EMQX's certificate is signed by DigiCert, which Node already trusts. Check that it connected:

```powershell
curl.exe https://<your-service>.onrender.com/health
```

(`curl.exe` is Windows' built-in HTTP client; it prints the backend's answer.) Expect `"mqtt":"connected"`. `"disconnected"` = it keeps retrying; the Render log says why (`check MQTT_USERNAME / MQTT_PASSWORD`, `check the host in MQTT_URL` …). `"off"` = `MQTT_URL` is empty.

Locally, the same three lines go into `backend/.env` (copy them from `backend/.env.example`).

## 5. ESP32

In `firmware/SmartGreenhouse/secrets.h` (copy `secrets.example.h` if you don't have one, or add the four MQTT lines to yours):

```c
#define MQTT_HOST "xxxxxxxx.ala.asia-southeast1.emqxsl.com"  // the Address only: no mqtts://, no port
#define MQTT_PORT 8883
#define MQTT_USERNAME "greenhouse-device"
#define MQTT_PASSWORD "its-password"
```

Keep `SERVER_URL` and `DEVICE_KEY`: they're used for the HTTPS fallback and the keep-awake ping. Install the library **PubSubClient by Nick O'Leary, 2.8** (Arduino IDE → Library Manager), then flash ([firmware.md](firmware.md)). The ESP32 checks the broker's certificate against the root in `mqtt_ca.h` (DigiCert Global Root G2, from EMQX's console → Overview → CA certificate), so its password only ever goes to the real EMQX.

Serial Monitor (115200 baud) on success:

```
[mqtt] connecting to xxxxxxxx.ala.asia-southeast1.emqxsl.com:8883 as gh-01-a1b2c3 …
[mqtt] connected; readings go to greenhouse/gh-01/telemetry, commands from greenhouse/gh-01/command
```

The blue LED is **steady on** over MQTT, and on with a short blink-off every 2 s on the HTTPS fallback. Type `status` for details.

## 6. Check it end to end

1. EMQX console → **Monitor/Clients** (name varies by console version): two clients, `gh-01-…` and `greenhouse-backend-…`.
2. The app → **Settings → Device** shows **Data link · MQTT (EMQX broker)**.
3. App → **Control → Soil calibration → Dry**: confirmed within a few seconds (the command travels over MQTT; the response of `POST /api/devices/gh-01/soil-calibration` says `"delivery":"mqtt"`).
4. **Last Will**: unplug the ESP32. After about 70 s the app shows it offline: the broker publishes `offline` on `greenhouse/gh-01/status` ~30 s after the link dies (1.5 × the 20 s keep-alive), and the backend waits one more reading interval + 10 s in case an HTTPS fallback reading follows. (Without the Last Will it would take 92 s: 3 missed readings.)
5. **Fallback**: in `secrets.h` set a wrong `MQTT_PASSWORD`, flash: readings keep arriving; Settings shows **HTTPS (MQTT fallback)**; the serial log says `login refused`. Put it back.

Without hardware, the simulator does the same over EMQX (from `backend/`, with the three `MQTT_*` lines in `backend/.env`):

```powershell
npm run sim -- --url https://<your-service>.onrender.com --mqtt-user greenhouse-device --mqtt-pass <device password>
```

(`npm run sim` starts the dev simulator; `--` passes the options on to it.) Ctrl+C ends it without an MQTT goodbye, so the broker sends its Last Will.

## Troubleshooting

| Symptom | Fix |
|---|---|
| ESP32: `state -2: TCP/TLS connection failed` | Wrong `MQTT_HOST`/`MQTT_PORT`, or the Wi-Fi blocks port 8883 (common on school networks): it falls back to HTTPS by itself; try a phone hotspot for MQTT |
| ESP32: `state 4/5: login refused` | `MQTT_USERNAME`/`MQTT_PASSWORD` in `secrets.h` don't match EMQX → Authentication |
| ESP32 never subscribes / commands never arrive | Authorization: allow Subscribe on `greenhouse/gh-01/command` for the device login |
| Render log: `Not authorized: check MQTT_USERNAME / MQTT_PASSWORD` | The backend's login in Render → Environment |
| Render log: `broker refused the subscription` | Authorization rules for `greenhouse-backend` (step 3) |
| `/health` says `"mqtt":"connected"` but the app shows HTTPS | The ESP32 isn't on MQTT: check its serial log |
| Everything was fine, now only HTTPS | The deployment may be stopped (quota used up or 30 days without clients): EMQX console → start it |
