# API contract

**Single source of truth** for every payload between the ESP32, the backend and the app. Update it whenever the API changes. The mobile Zod schemas mirror this file.

- Contract version: **deploy-1** (2026-11-26): the ESP32 posts readings over HTTPS (§4; MQTT removed), PostgreSQL, CORS, SMS alerts configured in the server environment (§7). Earlier: phase 11 (monitoring only), phase 10 (firmware, soil calibration), phase 8 (push, §6).
- Base URL: production `https://<your-service>.onrender.com`; local `http://localhost:4000` (`PORT` in `backend/.env`). The app reads it from `EXPO_PUBLIC_API_URL` only.
- All timestamps in REST and Socket.IO are **ISO-8601 UTC strings** (`"2026-11-09T10:15:00.000Z"`).
- Units: `airTemp` °C · `humidity` %RH · `soilMoisture` % (0 = dry calibration, 100 = wet) · `soilRaw` sensor output in mV (0–4095 accepted) · `lux` lx · `rssi` dBm.
- A sensor value of `null` means the read failed or the sensor is missing.
- There is **no soil temperature sensor**. No payload has a soil temperature field.

**Access.** Single user, no login. Two shared secrets, both from the server environment and never in the app:

| Header | Env variable | Needed for |
|---|---|---|
| `X-Device-Key` | `DEVICE_API_KEY` | `POST /api/readings` (the ESP32 / simulator) |
| `X-Admin-Key` | `ADMIN_API_KEY` | `POST /api/alerts/test` (one real test SMS) |

A missing or wrong key → `401 UNAUTHORIZED`. A route whose key isn't configured on the server → `503 NOT_CONFIGURED`.

**CORS** (browsers only, i.e. the web build): the origins in `CORS_ORIGIN` (comma-separated, e.g. `https://etanim.vercel.app`) and any `http://localhost:<port>` get `Access-Control-Allow-Origin`; methods GET, POST, PUT, PATCH, DELETE; headers `Content-Type`, `X-Device-Key`, `X-Admin-Key`. Requests without an `Origin` header (the ESP32, the Android app, curl) are unaffected. Socket.IO applies the same rule.

---

## 1. Data types

### Device

```json
{
  "id": "gh-01",
  "name": "gh-01",
  "online": true,
  "lastSeen": "2026-11-09T10:15:00.000Z",
  "createdAt": "2026-11-09T09:00:00.000Z",
  "telemetryIntervalSec": 30,
  "rssi": -61,
  "uptimeSec": 3605,
  "uptimeAt": "2026-11-09T10:15:00.000Z",
  "soilDryMv": 2600,
  "soilWetMv": 1200
}
```

| Field | Type | Notes |
|---|---|---|
| id | string | The `deviceId` of `POST /api/readings` (default `DEFAULT_DEVICE_ID`, `gh-01`). 1–64 chars `A-Z a-z 0-9 _ -` |
| name | string | Defaults to `id`; rename with `PATCH /api/devices/:id` (1–40 characters) |
| online | boolean | See "Online / offline" in §4 |
| lastSeen | string \| null | Time the backend last received a reading |
| createdAt | string | Auto-created on the first reading |
| telemetryIntervalSec | number \| null | Interval the device reports (`intervalSec`); null if never reported |
| rssi | number \| null | Latest Wi-Fi signal (dBm); null if not reported |
| uptimeSec / uptimeAt | number \| null / string \| null | Device uptime (s) as reported at `uptimeAt`. Current uptime ≈ `uptimeSec + (now − uptimeAt)` while online; a smaller value than before means it rebooted |
| soilDryMv / soilWetMv | number \| null | Soil calibration the device reports using; null if never reported. A change emits `device:status` (acknowledges `calibrateSoil`) |

### Reading

```json
{
  "id": 1234,
  "deviceId": "gh-01",
  "ts": "2026-11-09T10:15:00.000Z",
  "airTemp": 27.4,
  "humidity": 61.2,
  "soilMoisture": 43,
  "soilRaw": 2310,
  "lux": 812.5,
  "rssi": -61
}
```

`airTemp`, `humidity`, `soilMoisture`, `soilRaw`, `lux` and `rssi` are `number | null`. (The device sends the air temperature as `temperature`; it is stored and returned as `airTemp`.)

### Thresholds

```json
{
  "deviceId": "gh-01",
  "airTempMin": 15,
  "airTempMax": 35,
  "humidityMin": 40,
  "humidityMax": 85,
  "soilMoistureMin": 30,
  "soilMoistureMax": 80,
  "luxMin": null,
  "luxMax": null,
  "updatedAt": "2026-11-09T09:00:00.000Z"
}
```

| Field | Default | Rule |
|---|---|---|
| airTempMin / airTempMax | 15 / 35 | −40–80 °C, nullable |
| humidityMin / humidityMax | 40 / 85 | 0–100 %, nullable |
| soilMoistureMin / soilMoistureMax | 30 / 80 | 0–100 %, nullable |
| luxMin / luxMax | null / null | 0–200000 lx, nullable |

When both values of a min/max pair are set, min must be lower than max. `null` means "no limit". The limits feed the alert rules (§5) and the SMS alerts (§7); they live on the backend only and are never sent to the ESP32.

### Alert

```json
{
  "id": 42,
  "deviceId": "gh-01",
  "ts": "2026-11-09T10:15:00.000Z",
  "type": "above_max",
  "severity": "warning",
  "metric": "airTemp",
  "value": 35.4,
  "limit": 35,
  "message": "Air temperature high: 35.4 °C (max 35 °C)",
  "readAt": null,
  "sms": { "status": "sent", "at": "2026-11-09T10:15:01.000Z", "detail": null }
}
```

| Field | Type | Notes |
|---|---|---|
| id | number | Increasing; newer alerts have larger ids |
| ts | string | Server time when the alert was created |
| type | `"above_max" \| "below_min" \| "recovered" \| "offline" \| "online"` | See §5 |
| severity | `"info" \| "warning" \| "critical"` | |
| metric | `"airTemp" \| "humidity" \| "soilMoisture" \| "lux" \| null` | null for `offline`/`online` |
| value | number \| null | The reading that caused the alert; null for `offline`/`online` |
| limit | number \| null | The threshold that was crossed (`above_max` → the max, `below_min` → the min). `null` for `recovered`, `offline`, `online` |
| message | string | Ready-to-display English text (numbers rounded to 1 decimal, trailing `.0` dropped) |
| readAt | string \| null | null = unread |
| sms | object \| null | The newest SMS attempt for this alert (§7): `status` `"sent" \| "failed" \| "skipped_cooldown" \| "skipped_daily_cap" \| "dry_run"`, `at`, `detail` (why it wasn't sent; null when sent). `null` = no SMS for this alert (SMS off, not processed yet, or not a texted situation). The Socket.IO `alert` event always has `sms: null` (the SMS is sent right after) |

### Error

Every non-2xx response has this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [{ "path": "airTempMin", "message": "airTempMin must be lower than airTempMax" }]
  }
}
```

`details` is present only for `VALIDATION_ERROR`. No stack traces, ever.

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body or query fails validation (bad or out-of-range values) |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 4xx | `BAD_REQUEST` | Other client errors (e.g. 413 body > 16 kB) |
| 401 | `UNAUTHORIZED` | Missing or wrong `X-Device-Key` / `X-Admin-Key` |
| 404 | `NOT_FOUND` | Unknown device, alert or route |
| 409 | `DEVICE_OFFLINE` | Soil calibration requested for an offline device |
| 409 | `SMS_NOT_CONFIGURED` | Test SMS requested but `ALERT_PHONE_NUMBERS` is empty |
| 409 | `NOT_SIMULATED` | Dev-only scenario requested for a device that is not a running simulator |
| 429 | `RATE_LIMITED` | Too many test SMS (5 per hour) |
| 503 | `NOT_CONFIGURED` | The route's key (`DEVICE_API_KEY` / `ADMIN_API_KEY`) is not set on the server |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## 2. REST endpoints

Request bodies are JSON (`Content-Type: application/json`, max 16 kB). Unknown body fields are rejected (`VALIDATION_ERROR`), except in `POST /api/readings` (ignored, so newer firmware keeps working).

### GET /health

Render's health check. **Always 200** while the process runs (a database outage must not make Render restart the service in a loop); `db` reports the database (checked with a 3 s limit).

```json
{ "status": "ok", "db": "ok", "time": "2026-11-26T10:15:00.000Z", "uptimeSec": 342 }
```

`status` is `"ok"` or `"degraded"`, `db` is `"ok"` or `"error"`.

### GET /api/health

The app's connection check: **200** when the database works, **503** when it doesn't.

```json
{ "status": "ok", "db": "ok", "uptimeSec": 342, "devTools": false, "time": "2026-11-26T10:15:00.000Z" }
```

`devTools` is `true` only with `DEV_TOOLS=true` (the app shows its dev-only Demo sheet then; see "Dev-only endpoints").

### POST /api/readings

**The ESP32 (and the simulator) send every reading here.** Header `X-Device-Key: <DEVICE_API_KEY>`.

```json
{
  "deviceId": "gh-01",
  "temperature": 27.4,
  "humidity": 61.2,
  "soilMoisture": 43,
  "lux": 812.5,
  "soilRaw": 2310,
  "rssi": -61,
  "intervalSec": 30,
  "uptimeSec": 3605,
  "soilDryMv": 2600,
  "soilWetMv": 1200,
  "ts": 1764152100000
}
```

| Field | Type | Required | Range |
|---|---|---|---|
| deviceId | string | no (default `DEFAULT_DEVICE_ID`) | 1–64 chars `A-Z a-z 0-9 _ -` |
| temperature | number \| null | **yes** (or `airTemp`, not both) | −40–80 °C |
| humidity | number \| null | **yes** | 0–100 % |
| soilMoisture | number \| null | **yes** | 0–100 % |
| lux | number \| null | **yes** | 0–200000 lx |
| soilRaw | integer \| null | no | 0–4095 (mV) |
| rssi | integer \| null | no | −127–0 dBm |
| intervalSec | integer | no (recommended) | 1–3600: the device's normal interval; drives offline detection |
| uptimeSec | integer | no | ≥ 0: seconds since the device booted |
| soilDryMv / soilWetMv | integer | no | 0–4095: soil calibration in use (acknowledges `calibrateSoil`) |
| ts | integer, epoch **ms** | no | Used only if within 24 h in the past … 60 s in the future of the server clock; otherwise (no NTP) the receive time is used |
| errors | string[] | no | Failing sensors: `"dht"` (temperature + humidity null), `"bh1750"` (lux null), `"soil"` (soilMoisture + soilRaw null), `"soil_cal"` (calibration invalid). Logged when the set changes |
| simulator | boolean | no | Dev only, from the simulator; never sent by the real firmware |

**A failed sensor is sent as `null`, never as a made-up number.** A value out of range, a wrong type, a missing required field, or both `temperature` and `airTemp` → **400** `VALIDATION_ERROR` naming the field. Bad JSON (e.g. a literal `nan`) → 400 `INVALID_JSON`. A missing or wrong key → **401**.

**201** once the reading is stored:

```json
{
  "reading": { "id": 1234, "deviceId": "gh-01", "ts": "2026-11-26T10:15:00.000Z", "airTemp": 27.4, "humidity": 61.2, "soilMoisture": 43, "soilRaw": 2310, "lux": 812.5, "rssi": -61 },
  "commands": [{ "id": "a41f…", "type": "calibrateSoil", "point": "dry", "issuedAt": "2026-11-26T10:14:40.000Z" }]
}
```

`commands` holds the commands queued for this device (usually `[]`; §4). Alert rules, SMS, push and live updates run **after** the response: their failures never fail or delay the device's request.

### GET /api/readings/latest

The newest reading of the greenhouse (`?deviceId=` optional; default `DEFAULT_DEVICE_ID`, or the first device if that one doesn't exist).

```json
{ "device": { "id": "gh-01", "name": "gh-01", "online": true, "…": "…" }, "reading": { "id": 1234, "…": "…" } }
```

Before the first reading ever arrives: `200 { "device": null, "reading": null }`. 404 for an unknown `deviceId`.

### GET /api/readings?range=

Time-ordered history of all four sensors, **oldest first**.

| Query | Required | Values |
|---|---|---|
| range | no (default `24h`) | `1h` · `24h` · `7d` · `30d` |
| deviceId | no | as above |

The window `[now − range, now]` is cut into buckets of `bucketMs = max(10 s, range / 360)` (1h → 10 s, i.e. every reading; 24h → 4 min; 7d → 28 min; 30d → 2 h), aligned to multiples of `bucketMs` since the epoch. Each point is the bucket's average per sensor (2 decimals; `null` if that sensor had no value) and `count` (readings in the bucket). Empty buckets are omitted.

```json
{
  "deviceId": "gh-01",
  "range": "1h",
  "from": "2026-11-26T09:15:00.000Z",
  "to": "2026-11-26T10:15:00.000Z",
  "bucketMs": 10000,
  "points": [{ "ts": "2026-11-26T09:15:20.000Z", "airTemp": 27.1, "humidity": 62, "soilMoisture": 43, "lux": 790, "count": 1 }]
}
```

Before any reading: `deviceId: null`, `points: []`. 400 for an invalid `range`.

### GET /api/stats?range=

Min / max / average of each sensor over the window (same `range` and `deviceId` as above; default `24h`).

```json
{
  "deviceId": "gh-01",
  "range": "24h",
  "from": "2026-11-25T10:15:00.000Z",
  "to": "2026-11-26T10:15:00.000Z",
  "count": 2880,
  "stats": {
    "airTemp": { "min": 24.1, "max": 33.4, "avg": 28.62, "count": 2875 },
    "humidity": { "min": 52, "max": 88.5, "avg": 70.1, "count": 2875 },
    "soilMoisture": { "min": 31, "max": 64, "avg": 47.3, "count": 2880 },
    "lux": { "min": 0, "max": 41200, "avg": 9800.5, "count": 2880 }
  }
}
```

`count` = readings in the window; each sensor's `count` = readings where it had a value. Without data the values are `null` and counts 0. 400 for an invalid `range`.

### GET /api/thresholds · PUT /api/thresholds

The greenhouse's alert limits (`?deviceId=` optional, as above). Same bodies and rules as `GET/PUT /api/devices/:id/thresholds` below. 404 before any device exists.

### GET /api/devices

200 → `Device[]`, sorted by `id`.

### PATCH /api/devices/:id

Renames the greenhouse (the title in the app). The `id` never changes.

```json
{ "name": "Greenhouse 01" }
```

The name is trimmed and must be 1–40 characters without control characters (newlines, tabs). Unknown body fields are rejected. 200 → the updated `Device`, and every connected app also receives it as a `device:status` event. 400 `VALIDATION_ERROR`, 404 for an unknown device.

### GET /api/devices/:id/latest

200 → the device and its newest reading (`null` if none yet). 404 if the device is unknown.

```json
{
  "device": { "id": "gh-01", "name": "gh-01", "online": true, "lastSeen": "2026-11-09T10:15:00.000Z", "createdAt": "2026-11-09T09:00:00.000Z", "telemetryIntervalSec": 30 },
  "reading": { "id": 1234, "deviceId": "gh-01", "ts": "2026-11-09T10:15:00.000Z", "airTemp": 27.4, "humidity": 61.2, "soilMoisture": 43, "soilRaw": 2310, "lux": 812.5, "rssi": -61 }
}
```

### GET /api/devices/:id/history?metric=&range=

| Query | Required | Values |
|---|---|---|
| metric | yes | `airTemp` · `humidity` · `soilMoisture` · `soilRaw` · `lux` · `rssi` |
| range | no (default `24h`) | `24h` · `7d` · `30d` |

The server downsamples to about **200 points**. The window `[now − range, now]` is cut into buckets of `bucketMs = ceil(range / 200)`:

| range | bucketMs | ≈ bucket |
|---|---|---|
| 24h | 432000 | 7.2 min |
| 7d | 3024000 | 50.4 min |
| 30d | 12960000 | 3.6 h |

Each point gives `avg`, `min` and `max` (rounded to 2 decimals) and `count` (raw readings in the bucket). `ts` is the bucket **start**; buckets are aligned to multiples of `bucketMs` since the Unix epoch, so the first one can start slightly before `from`. Buckets without readings are **omitted**: a jump of more than `bucketMs` between consecutive points is a gap, which the chart should draw as a break. Readings where the metric is `null` are ignored. Up to 201 points are returned.

200:

```json
{
  "deviceId": "gh-01",
  "metric": "airTemp",
  "range": "24h",
  "from": "2026-11-08T10:15:00.000Z",
  "to": "2026-11-09T10:15:00.000Z",
  "bucketMs": 432000,
  "points": [
    { "ts": "2026-11-08T10:12:00.000Z", "avg": 26.81, "min": 26.5, "max": 27.2, "count": 43 },
    { "ts": "2026-11-08T10:19:12.000Z", "avg": 27.05, "min": 26.9, "max": 27.3, "count": 44 }
  ]
}
```

400 `VALIDATION_ERROR` for a missing or invalid `metric`/`range`. 404 for an unknown device.

### GET /api/devices/:id/heatmap?metric=&days=

Hourly averages per **Asia/Manila** calendar day (History "Temperature by hour, last 7 days").

| Query | Required | Values |
|---|---|---|
| metric | no (default `airTemp`) | `airTemp` · `humidity` · `soilMoisture` · `lux` |
| days | no (default `7`) | 1–30: today plus the previous days |

`rows` has one entry per day, oldest first; `hours[h]` is the average for Manila hour `h` (0–23), rounded to 2 decimals, or `null` without data (including hours later today).

```json
{
  "deviceId": "gh-01",
  "metric": "airTemp",
  "days": 7,
  "from": "2026-11-02T16:00:00.000Z",
  "to": "2026-11-09T13:20:00.000Z",
  "rows": [
    { "date": "2026-11-03", "weekday": "Tue", "hours": [24.1, 23.8, 23.6, 23.5, 23.3, 23.4, 24.2, 25.9, 27.8, 29.6, 31.0, 32.2, 33.1, 33.4, 33.0, 32.1, 30.6, 28.9, 27.4, 26.5, 25.8, 25.2, null, 24.6] }
  ]
}
```

400 `VALIDATION_ERROR` for an invalid `metric`/`days`. 404 for an unknown device.

### GET /api/devices/:id/recent?minutes=

Raw readings for live charts (sparklines, "Last 30 minutes"), **oldest first**.

| Query | Required | Values |
|---|---|---|
| minutes | no (default `30`) | 1–60 |

The window is `[now − minutes, now]`. At most **360** readings are returned; longer series are thinned evenly, always keeping the first and the newest reading. Gaps (device offline) are simply missing readings.

```json
{
  "deviceId": "gh-01",
  "minutes": 30,
  "from": "2026-11-09T09:45:00.000Z",
  "to": "2026-11-09T10:15:00.000Z",
  "readings": [
    { "id": 1200, "deviceId": "gh-01", "ts": "2026-11-09T09:45:02.000Z", "airTemp": 27.1, "humidity": 62.0, "soilMoisture": 43, "soilRaw": 2312, "lux": 790.0, "rssi": -61 }
  ]
}
```

400 `VALIDATION_ERROR` for an invalid `minutes`. 404 for an unknown device.

### GET /api/devices/:id/thresholds

200 → `Thresholds`. They are created with the defaults when a device is auto-registered. 404 for an unknown device.

### PUT /api/devices/:id/thresholds

Full replacement: send **every** field (use `null` for "no limit").

```json
{
  "airTempMin": 12,
  "airTempMax": 36,
  "humidityMin": 40,
  "humidityMax": 85,
  "soilMoistureMin": 30,
  "soilMoistureMax": 80,
  "luxMin": null,
  "luxMax": null
}
```

200:

```json
{
  "thresholds": { "deviceId": "gh-01", "airTempMin": 12, "airTempMax": 36, "humidityMin": 40, "humidityMax": 85, "soilMoistureMin": 30, "soilMoistureMax": 80, "luxMin": null, "luxMax": null, "updatedAt": "2026-11-09T10:16:00.000Z" }
}
```

The thresholds are only used by the backend's alert rules; nothing is sent to the device. 400 `VALIDATION_ERROR` (see the rules in §1). 404 for an unknown device.

### POST /api/devices/:id/soil-calibration

Body `{ "point": "dry" }` or `{ "point": "wet" }`. Queues `calibrateSoil` (§4): the device saves its **current** soil reading as 0 % (dry: sensor in air) or 100 % (wet: sensor in water).

202:

```json
{ "commandId": "a41f…", "deviceId": "gh-01", "point": "dry", "status": "queued" }
```

The command goes out in the response to the device's next reading (≤ one interval, 30 s), and the device then posts a reading with the new `soilDryMv`/`soilWetMv` right away; that is the confirmation (`device:status`). Errors: 400 `VALIDATION_ERROR`, 404 `NOT_FOUND`, 409 `DEVICE_OFFLINE`. Also available on the serial console (`cal dry` / `cal wet`, docs/firmware.md).

### GET /api/alerts

Newest first, paginated with a cursor. Each item carries its SMS status (`sms`, §1).

| Query | Required | Values |
|---|---|---|
| deviceId | no | Only this device's alerts |
| severity | no | One or more, comma-separated: `critical` or `warning,critical` |
| unread | no | `true` = only unread, `false` = only read |
| cursor | no | The `nextCursor` value from the previous page |
| limit | no (default 30) | 1–100 |

200:

```json
{
  "items": [
    { "id": 43, "deviceId": "gh-01", "ts": "2026-11-09T10:20:00.000Z", "type": "recovered", "severity": "info", "metric": "airTemp", "value": 34.1, "limit": null, "message": "Air temperature back in range: 34.1 °C", "readAt": null, "sms": { "status": "sent", "at": "2026-11-09T10:20:01.000Z", "detail": null } },
    { "id": 42, "deviceId": "gh-01", "ts": "2026-11-09T10:15:00.000Z", "type": "above_max", "severity": "warning", "metric": "airTemp", "value": 35.4, "limit": 35, "message": "Air temperature high: 35.4 °C (max 35 °C)", "readAt": null, "sms": { "status": "failed", "at": "2026-11-09T10:15:11.000Z", "detail": "retried after \"no answer within 10 s\"; no answer within 10 s" } }
  ],
  "nextCursor": "42",
  "unreadCount": 5
}
```

- `nextCursor` is `null` on the last page. Fetch the next page with the same filters plus `cursor=<nextCursor>`.
- `unreadCount` is the total of unread alerts, filtered only by `deviceId` (for a badge), not by `severity`, `unread` or `cursor`.

400 `VALIDATION_ERROR` for invalid query values.

### POST /api/alerts/test

**Pre-demo check: sends one real test SMS** to every `ALERT_PHONE_NUMBERS` entry. Header `X-Admin-Key: <ADMIN_API_KEY>`. No body.

200:

```json
{
  "status": "sent",
  "dryRun": false,
  "recipients": ["091••••4567"],
  "message": "[Greenhouse] Test message: SMS alerts are working (14:32)",
  "providerResponse": "[{\"message_id\":123,\"recipient\":\"639•••••4567\",\"status\":\"Queued\"}]",
  "at": "2026-11-26T06:32:00.000Z"
}
```

`status` is `"sent"`, `"failed"` (see `providerResponse`) or `"dry_run"` (with `SMS_DRY_RUN=true` nothing is sent). "sent" means Semaphore accepted it; delivery to the phone is not confirmed. Errors: 401 `UNAUTHORIZED`, 503 `NOT_CONFIGURED` (no `ADMIN_API_KEY`), 409 `SMS_NOT_CONFIGURED` (no numbers), 429 `RATE_LIMITED` (5 per hour). Example:

```powershell
curl.exe -X POST -H "X-Admin-Key: <ADMIN_API_KEY>" https://<your-service>.onrender.com/api/alerts/test
```

### POST /api/alerts/:id/read

No body. 200 → the updated `Alert`. Idempotent: an alert that is already read keeps its original `readAt`. 404 for an unknown id.

### POST /api/alerts/read-all

Optional body `{ "deviceId": "gh-01" }` limits it to one device; with no body, all alerts are marked read.

```json
{ "updated": 5, "readAt": "2026-11-09T10:30:00.000Z" }
```

### GET /api/sms/status

Read-only SMS setup (configured in the server environment, §7) and the 10 newest attempts. Numbers are always masked.

```json
{
  "provider": "semaphore",
  "dryRun": false,
  "recipients": ["091••••4567", "091••••4321"],
  "cooldownMinutes": 30,
  "dailyCap": 10,
  "offlineAfterMinutes": 10,
  "sentLast24h": 2,
  "recent": [
    { "id": 7, "at": "2026-11-26T06:32:00.000Z", "kind": "threshold", "deviceId": "gh-01", "alertId": 42, "sensor": "airTemp", "condition": "HIGH", "value": 36.2, "threshold": 35, "message": "[Greenhouse] Air temp HIGH: 36.2C (max 35C) at 14:32", "recipients": ["091••••4567", "091••••4321"], "status": "sent", "providerResponse": "[…]" }
  ]
}
```

### POST /api/push-tokens

Registers this phone for closed-app push notifications (§6). The app calls it on every start, after the permission is granted, and when the token rotates. Idempotent.

```json
{ "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]", "platform": "android" }
```

| Field | Required | Values |
|---|---|---|
| token | yes | Expo push token: `ExponentPushToken[…]` (from `getExpoPushTokenAsync`) |
| platform | no (default `"android"`) | `"android"` only |

201 (new token) or 200 (already known; `updatedAt` refreshed):

```json
{ "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]", "platform": "android", "createdAt": "2026-11-09T10:00:00.000Z", "updatedAt": "2026-11-09T10:30:00.000Z" }
```

400 `VALIDATION_ERROR` if the token isn't an Expo push token.

### DELETE /api/push-tokens/:token

Stops pushes to that token. The token must be URL-encoded (`ExponentPushToken%5B…%5D`). 204, also when the token is unknown (idempotent). The backend also deletes tokens itself when Expo reports `DeviceNotRegistered` (§6).

### GET /api/notifications/settings

Push preferences. Single-user app: one set of preferences for every registered phone, stored on the backend.

```json
{ "enabled": true, "minSeverity": "warning", "updatedAt": "2026-11-09T10:00:00.000Z" }
```

| Field | Type | Default | Notes |
|---|---|---|---|
| enabled | boolean | true | false = no pushes at all (alerts still appear in the app) |
| minSeverity | `"info" \| "warning" \| "critical"` | `"warning"` | Alerts below this severity are not pushed |

### PUT /api/notifications/settings

Body `{ "enabled": true, "minSeverity": "critical" }` (both required). 200 → the saved settings (same shape as GET). 400 `VALIDATION_ERROR` for invalid values.

### POST /api/notifications/test

Setup check: sends a test push to every registered phone, ignoring the preferences. The body is optional:

```json
{ "preset": "demo" }
```

- No body: the title is "ETanim" and the text "Test notification: push alerts work on this phone."
- `{ "preset": "demo" }`: the prototype's sample alert, title "Greenhouse alert" and body "Air temperature 36.4 °C — above the 35 °C limit" (used by the app's dev-only Demo sheet).
- Any other `preset`, or unknown fields: 400 `VALIDATION_ERROR`.

200:

```json
{ "tokens": 1, "sent": 1, "failed": 0, "removed": 0 }
```

`tokens` = registered phones, `sent` = accepted by Expo, `failed` = rejected (or no internet), `removed` = tokens deleted because of `DeviceNotRegistered`. Delivery to the phone is not confirmed by this response.

### Dev-only endpoints (`DEV_TOOLS=true`)

For the app's "Presentation tools" (demos). They exist **only** when the backend runs with `DEV_TOOLS=true` (default `false`); otherwise every `/api/dev/*` path answers 404 like any unknown route. They change **only the simulator**: a scenario is queued as a `simulate` command (§4) for a device whose readings say `"simulator": true`; the real firmware never gets one (and would ignore it).

`GET /api/dev/status` → `{ "enabled": true, "simulated": ["gh-01"] }`: devices whose readings carried `"simulator": true` within the last 30 s.

`POST /api/dev/simulate`:

```json
{ "deviceId": "gh-01", "scenario": "heatwave" }
```

| scenario | Effect on the simulator |
|---|---|
| `heatwave` | Air temperature jumps above 35 °C and keeps rising toward 40 °C |
| `drysoil` | Soil moisture drops to 27 % and keeps drying (below the default 30 % limit) |
| `normal` | Clears both scenarios: air temperature ≤ 27 °C, soil ≥ 60 % |

202 `{ "deviceId", "scenario", "status": "queued" }`: it applies with the simulator's next reading. 409 `NOT_SIMULATED` if `deviceId` is not a running simulator, 400 `VALIDATION_ERROR`.

---

## 3. Socket.IO events

Connect to the same base URL, default path `/socket.io`, socket.io-client **v4**. The server broadcasts to every connected client; there are no client → server events. Browser clients are checked like REST calls (CORS).

| Event | Payload | When |
|---|---|---|
| `telemetry` | `Reading` | Every stored reading |
| `device:status` | `Device` | A device goes online or offline, is auto-created, is renamed, or reports a different soil calibration (acknowledgement). RSSI/uptime updates alone don't emit it |
| `alert` | `Alert` | Every new alert (§5), with `sms: null` |

Payloads are the same JSON shapes as in REST (§1). Marking alerts read does not emit an event.

After a (re)connect, the app should refetch `GET /api/devices`, `/latest` and the first page of `/api/alerts`, because events sent while it was disconnected are not replayed. The app also **polls** the latest reading every 10 s, so it stays current even without the socket (e.g. behind a proxy that blocks WebSockets).

**Client reconnect policy (the app):**
- Reconnect with exponential backoff and jitter: 1 s, 2 s, 4 s … capped at 30 s, each ±50 %.
- Retry immediately when the network changes or the app returns to the foreground.
- Close the socket while the app is in the background or the phone is offline.

---

## 4. Device ↔ backend (HTTPS)

The ESP32 sends a reading to `POST /api/readings` (§2) every **30 s** (`intervalSec: 30`) over HTTPS, with `X-Device-Key`. The app never talks to the ESP32.

### Commands (backend → device)

The device can't be called directly, so commands wait on the backend (in memory, up to **120 s**) and go out **once** in the `commands` array of the response to the device's next reading. A newer command of the same type replaces a pending one. A backend restart drops pending commands.

**calibrateSoil**: the device stores its **current** averaged soil reading (mV) in NVS, as the dry point (`"dry"`, sensor in air = 0 %) or the wet point (`"wet"`, sensor in water = 100 %), then posts a reading right away with the new `soilDryMv`/`soilWetMv` (the confirmation). If the current reading is invalid, it ignores the command and logs why.

```json
{ "id": "a41f…", "type": "calibrateSoil", "point": "dry", "issuedAt": "2026-11-26T10:14:40.000Z" }
```

**simulate** (dev simulator only): `{ "id", "type": "simulate", "scenario": "heatwave" | "drysoil" | "normal", "issuedAt" }`.

- A device must ignore a command type it doesn't know, or with invalid values.
- **Stale commands.** A device must ignore a command whose `issuedAt` is more than **150 s** in the past, if its clock is set (NTP).

### Online / offline

A device is **online** from its first reading. It becomes **offline** when no reading arrives for **3 intervals + 2 s** (`3 × intervalSec + 2`, 92 s at 30 s; `OFFLINE_AFTER_SEC`, default 90 s, if it never sent `intervalSec`). The backend checks every 2 s. Silence is counted only since the backend started: after a restart (e.g. a Render cold start), devices get a full window before being marked offline.

Each online→offline transition emits `device:status` and creates **one** `offline` alert; each offline→online transition emits `device:status` and creates one `online` info alert. `offline`/`online` alerts are only created for devices that have sent readings before.

### Auto-registration

The first valid reading for an unknown `deviceId` creates the device (name = id) with default thresholds.

### Data retention

Raw readings older than `READINGS_RETENTION_DAYS` (default **30**, matching the longest history range) are deleted once a day, starting 1 min after the backend starts. Alerts, SMS attempts and thresholds are kept.

### Dev simulator

`npm run sim` (in `backend/`) acts as device `gh-01`: it posts readings with `X-Device-Key` exactly like the firmware and applies the returned commands. `npm run sim -- --help` lists the options (`--url` targets a deployed backend).

---

## 5. Alert rules

The backend checks every stored reading against the device's thresholds for `airTemp`, `humidity`, `soilMoisture` and `lux`. A `null` value (sensor failure) is skipped.

**Breach.** `value > max` gives `above_max`, and `value < min` gives `below_min`. A `null` limit is never checked.

**Severity.** A breach is `critical` when it is beyond the limit by at least the critical margin, otherwise `warning`. Recoveries and `online` alerts are `info`; `offline` is `warning`.

| Metric | Critical margin | Recovery deadband |
|---|---|---|
| airTemp | 3 °C | 0.5 °C |
| humidity | 10 % | 2 % |
| soilMoisture | 10 % | 2 % |
| lux | max(500 lx, 50 % of limit) | max(50 lx, 5 % of limit) |

Example with `airTempMax` = 35: 35.1 °C is a warning, 38 °C is critical, and the episode recovers at ≤ 34.5 °C.

**No spam.** A breach starts an *episode* that lasts until the value is back inside the limit by the deadband.

- **One alert per episode.** While the episode lasts, a new alert is created only when the severity **rises** (warning → critical). Falling back to warning creates nothing.
- **Cooldown** (`ALERT_COOLDOWN_MINUTES`, default 30). A new episode is announced only if the last breach alert for that metric is at least that old, **or** the new severity is higher than that alert's. Otherwise the episode stays silent. If it is still breached once the cooldown has passed, it is announced then.
- **Recovered.** When an announced episode ends, one `recovered` info alert is created. A silent episode ends silently.
- Alert state is rebuilt from the alert table after a backend restart, so a restart doesn't re-alert an open episode.

Changing thresholds takes effect on the next reading. Removing a limit (setting it to `null`) ends an open episode with `recovered`.

---

## 6. Push notifications (closed app, Android)

Every new alert (§5) is sent two ways:

1. **App open:** the `alert` Socket.IO event (§3). The app shows a toast and refreshes the list and badge. A push that arrives while the app is in the foreground goes to the notification shade silently (no banner or sound), to avoid showing it twice.
2. **App closed or in the background:** a push via backend → Expo Push Service → FCM → Android (development or release build; not Expo Go, not the web build).

An alert is pushed when `enabled` is true and its severity ≥ `minSeverity` (`info` < `warning` < `critical`). With the default (`warning`), `recovered` and `online` alerts are not pushed.

Push message (Expo format):

```json
{
  "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "title": "Greenhouse alert",
  "body": "Air temperature very high: 39.1 °C (max 35 °C)",
  "sound": "default",
  "priority": "high",
  "channelId": "greenhouse-alerts",
  "ttl": 86400,
  "data": { "url": "/alerts", "alertId": 44, "deviceId": "gh-01" }
}
```

- `title` is always "Greenhouse alert". `body` is `Alert.message`.
- `channelId` `greenhouse-alerts` is the Android channel the app creates (high importance, sound, vibration, lock screen). `priority: high` lets FCM wake a phone in Doze.
- `data.url` is the app route to open on tap. The app accepts only `/alerts`.
- `ttl` is 24 h: a phone that is off longer than that doesn't get stale alerts.

**Clean-up.** Messages are sent in chunks of up to 100. If a push ticket, or a receipt (checked about 15 min later), says `DeviceNotRegistered`, that token is deleted. Other errors are logged. A failed request never blocks alert creation.

**Backend env.** `PUSH_ENABLED=false` turns sending off. `EXPO_ACCESS_TOKEN` is needed only if "Enhanced push security" is on in the Expo project.

---

## 7. SMS alerts

The **backend** texts the numbers in `ALERT_PHONE_NUMBERS` through **Semaphore** (semaphore.co). The Semaphore API key lives only in the server environment: it is never sent to the app, never returned by the API and never logged.

**When** (after the reading is stored; never blocks or fails the reading request):

| Situation | SMS (condition) |
|---|---|
| A reading crosses a threshold, warning or critical: above the max or below the min (§5) | `HIGH` / `LOW`, e.g. `[Greenhouse] Soil moisture LOW: 18% (min 30%) at 14:32` |
| A silent episode (§5) gets announced after its cooldown | `HIGH` / `LOW` again |
| The value is back inside the limit, after a texted `HIGH`/`LOW` (≤ 48 h old) | One `NORMAL`: `[Greenhouse] Soil moisture back to normal: 35% at 15:02` |
| No reading for `SMS_OFFLINE_AFTER_MINUTES` (default 10; outages > 24 h are not announced) | `OFFLINE`: `[Greenhouse] gh-01 OFFLINE: no data for 12 min (last seen 14:05)` |
| Readings again after a texted outage | One `ONLINE`: `[Greenhouse] gh-01 back ONLINE at 14:20` |

**Limits.**
- **Cooldown:** no repeat SMS for the same sensor + condition (e.g. air temp `HIGH`) within `ALERT_COOLDOWN_MINUTES` (default 30). A crossing inside the cooldown is recorded with status `skipped_cooldown`. Severity changes inside an episode (warning → critical) are not new crossings.
- **Daily cap:** at most `SMS_DAILY_CAP` (default 10) real alert SMS per rolling 24 h; over it → `skipped_daily_cap`. Test SMS don't count.
- A failed SMS starts no cooldown (the next crossing tries again); a failed offline/online SMS is retried at most every 15 min.

**Every attempt is stored** (table `SmsAlert`): `id`, `sensor`, `condition`, `value`, `threshold`, `message`, `recipients` (masked), `status` (`sent` · `failed` · `skipped_cooldown` · `skipped_daily_cap` · `dry_run`), `provider_response` (key removed, numbers masked), `created_at`, plus `kind`, `deviceId` and `alertId` (the in-app alert it belongs to; shown as `Alert.sms`).

**Provider call.** One `POST https://api.semaphore.co/api/v4/messages` (form-encoded: `apikey`, `number` = all recipients comma-separated, `message`, optional `sendername`) per SMS. Timeout **10 s**; **one retry** after a network error, a timeout or an HTTP 5xx (a 4xx or a rejection is final). Semaphore's documented answer is one record per number with `status` Queued / Pending / Sent / Failed / Refunded; "sent" here means at least one number was accepted. Its error format is not documented, so any other answer counts as `failed` and is stored in `provider_response`. Retry caveat: if the first request timed out after Semaphore had accepted it, the SMS can arrive twice.

**Numbers.** Philippine mobiles, normalized to `09XXXXXXXXX` (the form in Semaphore's request examples). Accepted in `ALERT_PHONE_NUMBERS`: `09…`, `9…`, `639…`, `+639…`, with spaces/dashes. An invalid entry stops the backend at startup (its position is printed, never the number).

**Texts.** Plain ASCII, ≤ 160 characters (one SMS, one credit): the degree sign would force a 70-character mode, so temperatures read `36C`. Never starting with "TEST" (Semaphore silently drops those). Times are Asia/Manila.

**Dry run.** `SMS_DRY_RUN=true` (the default) records every attempt as `dry_run` and logs it; Semaphore is never called and no credit is used. Set `SMS_DRY_RUN=false` (plus `SEMAPHORE_API_KEY`) for real SMS.

**Backend env** (see `backend/.env.example` and docs/setup-sms.md):

| Variable | Default | Meaning |
|---|---|---|
| `ALERT_PHONE_NUMBERS` | empty (no SMS) | Comma-separated PH mobile numbers |
| `SMS_DRY_RUN` | `true` | `false` = real SMS |
| `SEMAPHORE_API_KEY` | none | Secret; required when `SMS_DRY_RUN=false` |
| `SEMAPHORE_SENDER_NAME` | account default | Registered sender name (max 11 characters) |
| `ALERT_COOLDOWN_MINUTES` | `30` | Per sensor + condition (also the in-app alert cooldown) |
| `SMS_DAILY_CAP` | `10` | Real alert SMS per rolling 24 h |
| `SMS_OFFLINE_AFTER_MINUTES` | `10` | "Offline" SMS after this much silence |
| `ADMIN_API_KEY` | none (required in production) | `X-Admin-Key` for `POST /api/alerts/test` |
