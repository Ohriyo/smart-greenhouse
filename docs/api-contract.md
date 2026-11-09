# API contract

**Single source of truth** for every payload between the ESP32, the backend and the app. Update it whenever the API changes. The mobile Zod schemas mirror this file.

- Contract version: **phase 10** (firmware: telemetry `errors`/`soilDryMv`/`soilWetMv`, `soilRaw` in mV, the `calibrateSoil` command and `POST /api/devices/:id/soil-calibration`). Phase 9 added the retained-status, stale-command and retention rules; phase 8 added push (§6).
- Base URL: `http://<laptop-LAN-IP>:4000` (port from `PORT` in `backend/.env`)
- All timestamps in REST and Socket.IO are **ISO-8601 UTC strings** (`"2026-11-09T10:15:00.000Z"`).
- Units: `airTemp` °C · `humidity` %RH · `soilMoisture` % (0 = dry calibration, 100 = wet) · `soilRaw` sensor output in mV (0–4095 accepted) · `lux` lx · `rssi` dBm.
- A sensor value of `null` means the read failed or the sensor is missing.
- There is **no soil temperature sensor**. No payload has a soil temperature field.

---

## 1. Data types

### FanMode

`"auto" | "on" | "off"`. In `auto` the ESP32 runs its local hysteresis (`fanOnTemp`/`fanOffTemp`). `on`/`off` force the fan.

### Device

```json
{
  "id": "gh-01",
  "name": "gh-01",
  "online": true,
  "lastSeen": "2026-11-09T10:15:00.000Z",
  "createdAt": "2026-11-09T09:00:00.000Z",
  "telemetryIntervalSec": 5,
  "reportedFanOnTemp": 32,
  "reportedFanOffTemp": 28,
  "reportedFanThresholdsAt": "2026-11-09T09:00:05.000Z",
  "rssi": -61,
  "uptimeSec": 3605,
  "uptimeAt": "2026-11-09T10:15:00.000Z",
  "soilDryMv": 2600,
  "soilWetMv": 1200
}
```

| Field | Type | Notes |
|---|---|---|
| id | string | From the MQTT topic. 1–64 chars `A-Z a-z 0-9 _ -` |
| name | string | Defaults to `id`; rename with `PATCH /api/devices/:id` (1–40 characters) |
| online | boolean | See "Online / offline" in §4 |
| lastSeen | string \| null | Time the backend last received a live message |
| createdAt | string | Auto-created on the first MQTT message |
| telemetryIntervalSec | number \| null | Interval the device reports in telemetry (`intervalSec`); null if never reported |
| reportedFanOnTemp / reportedFanOffTemp | number \| null | Fan thresholds the device last reported **using** (telemetry `fanOnTemp`/`fanOffTemp`); null if it never reported them |
| reportedFanThresholdsAt | string \| null | When those reported values last changed |
| rssi | number \| null | Latest Wi-Fi signal (dBm) from telemetry; null if not reported |
| uptimeSec / uptimeAt | number \| null / string \| null | Device uptime (s) as reported at `uptimeAt`. Current uptime ≈ `uptimeSec + (now − uptimeAt)` while online; a smaller value than before means it rebooted |
| soilDryMv / soilWetMv | number \| null | Soil calibration the device reports using (telemetry); null if never reported. A change emits `device:status` (acknowledges `calibrateSoil`) |

**Threshold acknowledgement:** the device has applied the saved fan thresholds when `reportedFanOnTemp === Thresholds.fanOnTemp` and `reportedFanOffTemp === Thresholds.fanOffTemp`. Until then the change is pending: it is sent immediately if the device is online, otherwise on its next reconnect (§4).

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
  "fanOn": false,
  "fanMode": "auto",
  "rssi": -61
}
```

`airTemp`, `humidity`, `soilMoisture`, `soilRaw`, `lux` and `rssi` are `number | null`. `fanOn` and `fanMode` are always present and are the **confirmed** fan state reported by the device.

### Thresholds

```json
{
  "deviceId": "gh-01",
  "fanOnTemp": 32,
  "fanOffTemp": 28,
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
| fanOnTemp | 32 | 10–50 °C |
| fanOffTemp | 28 | 10–50 °C and `fanOnTemp − fanOffTemp ≥ 1` |
| airTempMin / airTempMax | 15 / 35 | −40–80 °C, nullable |
| humidityMin / humidityMax | 40 / 85 | 0–100 %, nullable |
| soilMoistureMin / soilMoistureMax | 30 / 80 | 0–100 %, nullable |
| luxMin / luxMax | null / null | 0–200000 lx, nullable |

When both values of a min/max pair are set, min must be lower than max. `null` means "no limit". The min/max limits feed the alert rules (§5), and `fanOnTemp`/`fanOffTemp` are sent to the ESP32.

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
  "readAt": null
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
| limit | number \| null | The threshold that was crossed (`above_max` → the max, `below_min` → the min). `null` for `recovered`, `offline`, `online`, and for alerts created before this field existed |
| message | string | Ready-to-display English text (numbers rounded to 1 decimal, trailing `.0` dropped) |
| readAt | string \| null | null = unread |

### FanState

```json
{
  "deviceId": "gh-01",
  "ts": "2026-11-09T10:15:00.000Z",
  "fanOn": true,
  "fanMode": "auto",
  "airTemp": 32.1
}
```

A **confirmed** change of `fanOn` or `fanMode`, detected from telemetry. `airTemp` is the temperature at that moment (nullable).

### Error

Every non-2xx response has this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [{ "path": "fanOffTemp", "message": "fanOffTemp must be at least 1 °C below fanOnTemp" }]
  }
}
```

`details` is present only for `VALIDATION_ERROR`.

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body or query fails validation |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 4xx | `BAD_REQUEST` | Other client errors (e.g. 413 body > 16 kB) |
| 404 | `NOT_FOUND` | Unknown device, alert or route |
| 409 | `DEVICE_OFFLINE` | Command sent to an offline device |
| 409 | `SMS_NOT_CONFIGURED` | Test SMS requested but no owner number is saved |
| 409 | `NOT_SIMULATED` | Dev-only scenario requested for a device that is not a running simulator |
| 429 | `RATE_LIMITED` | Too many test SMS (5 per hour) |
| 503 | `BROKER_UNAVAILABLE` | Backend not connected to Mosquitto |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## 2. REST endpoints

Request bodies are JSON (`Content-Type: application/json`, max 16 kB). Unknown body fields are rejected (`VALIDATION_ERROR`).

### GET /api/health

200 when the database works (even if MQTT is down), 503 if the database fails.

```json
{
  "status": "ok",
  "db": "ok",
  "mqtt": "connected",
  "uptimeSec": 342,
  "devTools": false,
  "time": "2026-11-09T10:15:00.000Z"
}
```

`status` is `"ok"` or `"degraded"`, `db` is `"ok"` or `"error"`, and `mqtt` is `"connected"` or `"disconnected"`. `devTools` is `true` only when the backend runs with `DEV_TOOLS=true` (the app uses it to show or hide its dev-only Demo sheet; see "Dev-only endpoints" below).

### GET /api/devices

200 → `Device[]`, sorted by `id`.

```json
[{ "id": "gh-01", "name": "gh-01", "online": true, "lastSeen": "2026-11-09T10:15:00.000Z", "createdAt": "2026-11-09T09:00:00.000Z", "telemetryIntervalSec": 5, "reportedFanOnTemp": 32, "reportedFanOffTemp": 28, "reportedFanThresholdsAt": "2026-11-09T09:00:05.000Z" }]
```

### PATCH /api/devices/:id

Renames the greenhouse (the title in the app). The `id` (MQTT topic) never changes.

```json
{ "name": "Greenhouse 01" }
```

The name is trimmed and must be 1–40 characters without control characters (newlines, tabs). Unknown body fields are rejected. 200 → the updated `Device`, and every connected app also receives it as a `device:status` event. 400 `VALIDATION_ERROR`, 404 for an unknown device.

### GET /api/devices/:id/latest

200 → the device, its newest reading (`null` if none yet) and its most recent confirmed fan change (`lastFanChange`, a `FanState`, or `null`). 404 if the device is unknown.

```json
{
  "device": { "id": "gh-01", "name": "gh-01", "online": true, "lastSeen": "2026-11-09T10:15:00.000Z", "createdAt": "2026-11-09T09:00:00.000Z", "telemetryIntervalSec": 5, "reportedFanOnTemp": 32, "reportedFanOffTemp": 28, "reportedFanThresholdsAt": "2026-11-09T09:00:05.000Z" },
  "reading": { "id": 1234, "deviceId": "gh-01", "ts": "2026-11-09T10:15:00.000Z", "airTemp": 27.4, "humidity": 61.2, "soilMoisture": 43, "soilRaw": 2310, "lux": 812.5, "fanOn": false, "fanMode": "auto", "rssi": -61 },
  "lastFanChange": { "deviceId": "gh-01", "ts": "2026-11-09T09:42:10.000Z", "fanOn": false, "fanMode": "auto", "airTemp": 27.9 }
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

### GET /api/devices/:id/fan-activity?range=

How long the fan ran, per bucket (History "Fan activity" and "Fan was on").

| Query | Required | Values |
|---|---|---|
| range | no (default `24h`) | `24h` · `7d` · `30d` |

Buckets are aligned to **Asia/Manila** time and always all present (zeros included), oldest first; the last one contains "now":

| range | buckets | bucketSec |
|---|---|---|
| 24h | 24 × 1 hour | 3600 |
| 7d | 28 × 6 hours (00/06/12/18 h) | 21600 |
| 30d | 30 × 1 day (Manila midnight) | 86400 |

Time-weighted from readings: a reading with `fanOn: true` counts until the next reading, but at most `3 × telemetryIntervalSec + 2 s`, so time while the device was offline never counts as running. A bucket never exceeds its length (or the elapsed part of the current bucket).

200:

```json
{
  "deviceId": "gh-01",
  "range": "24h",
  "from": "2026-11-08T14:00:00.000Z",
  "to": "2026-11-09T13:20:00.000Z",
  "bucketSec": 3600,
  "totalOnSec": 8280,
  "buckets": [
    { "ts": "2026-11-08T14:00:00.000Z", "onSec": 0 },
    { "ts": "2026-11-08T15:00:00.000Z", "onSec": 1260 }
  ]
}
```

400 `VALIDATION_ERROR` for an invalid `range`. 404 for an unknown device.

### GET /api/devices/:id/heatmap?metric=&days=

Hourly averages per **Asia/Manila** calendar day (History "Temperature by hour, last 7 days").

| Query | Required | Values |
|---|---|---|
| metric | no (default `airTemp`) | `airTemp` · `humidity` · `soilMoisture` · `lux` |
| days | no (default `7`) | 1–30: today plus the previous days |

`rows` has one entry per day, oldest first; `hours[h]` is the average for Manila hour `h` (0–23), rounded to 2 decimals, or `null` without data (including hours later today).

200:

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

200:

```json
{
  "deviceId": "gh-01",
  "minutes": 30,
  "from": "2026-11-09T09:45:00.000Z",
  "to": "2026-11-09T10:15:00.000Z",
  "readings": [
    { "id": 1200, "deviceId": "gh-01", "ts": "2026-11-09T09:45:02.000Z", "airTemp": 27.1, "humidity": 62.0, "soilMoisture": 43, "soilRaw": 2312, "lux": 790.0, "fanOn": false, "fanMode": "auto", "rssi": -61 }
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
  "fanOnTemp": 31,
  "fanOffTemp": 27.5,
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
  "thresholds": { "deviceId": "gh-01", "fanOnTemp": 31, "fanOffTemp": 27.5, "airTempMin": 12, "airTempMax": 36, "humidityMin": 40, "humidityMax": 85, "soilMoistureMin": 30, "soilMoistureMax": 80, "luxMin": null, "luxMax": null, "updatedAt": "2026-11-09T10:16:00.000Z" },
  "deviceSync": "sent"
}
```

`deviceSync` reports whether `fanOnTemp`/`fanOffTemp` reached the ESP32:

- `"sent"`: a `setFanThresholds` command was published to the device.
- `"pending"`: the device (or broker) is offline. The thresholds are saved and sent automatically the next time the device comes online.

400 `VALIDATION_ERROR` (see the rules in §1). 404 for an unknown device.

### POST /api/devices/:id/fan

```json
{ "mode": "on" }
```

`mode` is `"auto" | "on" | "off"`.

202 Accepted: the command was **sent, not yet confirmed**.

```json
{ "commandId": "6f1c2a9e-3b0d-4a51-9a39-2f3e7c1d8b44", "deviceId": "gh-01", "mode": "on", "status": "sent" }
```

The app must **not** show the new mode from this response. The confirmed state arrives as a `fan:state` event (and in the next `telemetry`) once the ESP32 has applied it, usually within a second or two. If nothing arrives within ~10 s, the app should show "not confirmed".

Errors: 400 `VALIDATION_ERROR`, 404 `NOT_FOUND`, 409 `DEVICE_OFFLINE` (nothing is sent), 503 `BROKER_UNAVAILABLE`.

### POST /api/devices/:id/soil-calibration

Body `{ "point": "dry" }` or `{ "point": "wet" }`. Sends `calibrateSoil` (§4): the device saves its **current** soil reading as 0 % (dry: sensor in air) or 100 % (wet: sensor in water).

202:

```json
{ "commandId": "a41f…", "deviceId": "gh-01", "point": "dry", "status": "sent" }
```

Confirmation is the next telemetry with the new `soilDryMv`/`soilWetMv`. Errors: 400 `VALIDATION_ERROR`, 404 `NOT_FOUND`, 409 `DEVICE_OFFLINE`, 503 `BROKER_UNAVAILABLE`. There's no app UI for this (yet). Use curl, or the serial console (`cal dry` / `cal wet`, docs/firmware.md).

### GET /api/alerts

Newest first, paginated with a cursor.

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
    { "id": 43, "deviceId": "gh-01", "ts": "2026-11-09T10:20:00.000Z", "type": "recovered", "severity": "info", "metric": "airTemp", "value": 34.1, "limit": null, "message": "Air temperature back in range: 34.1 °C", "readAt": null },
    { "id": 42, "deviceId": "gh-01", "ts": "2026-11-09T10:15:00.000Z", "type": "above_max", "severity": "warning", "metric": "airTemp", "value": 35.4, "limit": 35, "message": "Air temperature high: 35.4 °C (max 35 °C)", "readAt": null }
  ],
  "nextCursor": "42",
  "unreadCount": 5
}
```

- `nextCursor` is `null` on the last page. Fetch the next page with the same filters plus `cursor=<nextCursor>`.
- `unreadCount` is the total of unread alerts, filtered only by `deviceId` (for a badge), not by `severity`, `unread` or `cursor`.

400 `VALIDATION_ERROR` for invalid query values.

### POST /api/alerts/:id/read

No body. 200 → the updated `Alert`. Idempotent: an alert that is already read keeps its original `readAt`. 404 for an unknown id.

### POST /api/alerts/read-all

Optional body `{ "deviceId": "gh-01" }` limits it to one device; with no body, all alerts are marked read.

200:

```json
{ "updated": 5, "readAt": "2026-11-09T10:30:00.000Z" }
```

### POST /api/push-tokens

Registers this phone for closed-app push notifications (§6). The app calls it on every start, after the permission is granted, when the server address changes, and when the token rotates. Idempotent.

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
- `{ "preset": "demo" }`: the prototype's sample alert, title "Greenhouse alert" and body "Air temperature 33.1 °C — fan turned on". It looks exactly like a real alert push and opens the Alerts tab when tapped (used by the app's dev-only Demo sheet).
- Any other `preset`, or unknown fields: 400 `VALIDATION_ERROR`.

200:

```json
{ "tokens": 1, "sent": 1, "failed": 0, "removed": 0 }
```

`tokens` = registered phones, `sent` = accepted by Expo, `failed` = rejected (or no internet), `removed` = tokens deleted because of `DeviceNotRegistered`. Delivery to the phone is not confirmed by this response.

### Dev-only endpoints (`DEV_TOOLS=true`)

For the app's "Presentation tools" (demos). They exist **only** when the backend runs with `DEV_TOOLS=true` (default `false`); otherwise every `/api/dev/*` path answers 404 `NOT_FOUND` like any unknown route. They change **only the simulator**: scenarios go to the MQTT topic `greenhouse/{deviceId}/sim`, which the real firmware never subscribes to, so real hardware and your stored history can't be affected.

`GET /api/dev/status` → `{ "enabled": true, "simulated": ["gh-01"] }`. `simulated` lists devices whose telemetry carried `"simulator": true` within the last 30 s (§4).

`POST /api/dev/simulate`:

```json
{ "deviceId": "gh-01", "scenario": "heatwave" }
```

| scenario | Effect on the simulator |
|---|---|
| `heatwave` | Air temperature jumps to ≥ 33.1 °C and keeps rising toward 41 °C (fan ON, warning, critical within ~30 s) |
| `drysoil` | Soil moisture drops to 27 % and keeps drying (below the default 30 % limit) |
| `normal` | Clears both scenarios: air temperature ≤ 27 °C (fan switches off), soil ≥ 60 % |

202 `{ "deviceId", "scenario", "status": "sent" }`. 409 `NOT_SIMULATED` if `deviceId` is not a running simulator (including real hardware: it is never touched), 400 `VALIDATION_ERROR`, 503 `BROKER_UNAVAILABLE`.
---

## 3. Socket.IO events

Connect to the same base URL (`http://<laptop-LAN-IP>:4000`), default path `/socket.io`. The server broadcasts to every connected client; there are no client → server events yet. Use socket.io-client **v4**.

| Event | Payload | When |
|---|---|---|
| `telemetry` | `Reading` | Every stored reading |
| `device:status` | `Device` | A device goes online or offline, is auto-created, is renamed, or reports different fan thresholds or soil calibration (acknowledgement). RSSI/uptime updates alone don't emit it (they arrive with every `telemetry`) |
| `fan:state` | `FanState` | Confirmed change of `fanOn` or `fanMode` (also for a device's first reading) |
| `alert` | `Alert` | Every new alert (§5) |

Payloads are the same JSON shapes as in REST (§1). Example `telemetry` payload:

```json
{ "id": 1235, "deviceId": "gh-01", "ts": "2026-11-09T10:15:10.000Z", "airTemp": 27.5, "humidity": 61.0, "soilMoisture": 43, "soilRaw": 2309, "lux": 815.0, "fanOn": false, "fanMode": "auto", "rssi": -60 }
```

Example `alert` payload:

```json
{ "id": 44, "deviceId": "gh-01", "ts": "2026-11-09T10:25:00.000Z", "type": "offline", "severity": "warning", "metric": null, "value": null, "limit": null, "message": "gh-01 went offline (no data for 17 s, 3 missed intervals)", "readAt": null }
```

Marking alerts read does not emit an event.

After a (re)connect, the app should refetch `GET /api/devices`, `/latest` and the first page of `/api/alerts`, because events sent while it was disconnected are not replayed.

**Client reconnect policy (the app):**
- Reconnect with exponential backoff and jitter: 1 s, 2 s, 4 s … capped at 30 s, each ±50 %.
- Retry immediately when the network changes or the app returns to the foreground.
- Close the socket while the app is in the background or the phone is offline.
- After every (re)connect, refetch as above.

---

## 4. MQTT (ESP32 / simulator ↔ backend)

The broker is Mosquitto on the laptop, port 1883. `{deviceId}` uses the same rules as `Device.id`. The app never uses MQTT.

### greenhouse/{deviceId}/telemetry (device → backend)

QoS 0 or 1, not retained. JSON:

```json
{
  "ts": 1762683300000,
  "airTemp": 27.4,
  "humidity": 61.2,
  "soilMoisture": 43,
  "soilRaw": 2310,
  "lux": 812.5,
  "fanOn": false,
  "fanMode": "auto",
  "rssi": -61,
  "intervalSec": 5,
  "uptimeSec": 3605,
  "fanOnTemp": 32,
  "fanOffTemp": 28,
  "soilDryMv": 2600,
  "soilWetMv": 1200
}
```

With a failed sensor, its values are `null` and `errors` names it:

```json
{ "ts": 1762683305000, "airTemp": null, "humidity": null, "soilMoisture": 43, "soilRaw": 2310, "lux": 812.5, "fanOn": false, "fanMode": "auto", "rssi": -61, "intervalSec": 5, "fanOnTemp": 32, "fanOffTemp": 28, "soilDryMv": 2600, "soilWetMv": 1200, "errors": ["dht"] }
```

| Field | Type | Required | Range |
|---|---|---|---|
| ts | integer, epoch **ms** | no | Used only if within 24 h in the past … 60 s in the future of the backend clock; otherwise (e.g. no NTP) the receive time is used |
| airTemp | number \| null | no (missing = null) | −40–80 |
| humidity | number \| null | no | 0–100 |
| soilMoisture | number \| null | no | 0–100 |
| soilRaw | integer \| null | no | 0–4095 |
| lux | number \| null | no | 0–200000 |
| fanOn | boolean | **yes** | actual relay/MOSFET state |
| fanMode | FanMode | **yes** | current mode |
| rssi | integer \| null | no | −127–0 |
| intervalSec | integer | no (recommended) | 1–3600: the device's normal telemetry interval |
| uptimeSec | integer | no | ≥ 0: seconds since the device booted (a drop means it rebooted). Stored as `Device.uptimeSec/uptimeAt` |
| simulator | boolean | no | Dev only: `true` from the simulator. The real firmware never sends it. Not stored; used by the dev-only Demo tools to refuse scenarios for real hardware |
| fanOnTemp / fanOffTemp | number | no (recommended, send both) | 10–50: the fan thresholds the device is **currently using** (its NVS values). This is how a `setFanThresholds` command is acknowledged. |
| soilDryMv / soilWetMv | integer | no | 0–4095: soil calibration in use, in mV: sensor in air = 0 %, in water = 100 %. This acknowledges `calibrateSoil`. Stored on the Device (`Device.soilDryMv/soilWetMv`) |
| errors | string[] | no (omit or `[]` when all ok) | Failing sensors: `"dht"` (airTemp + humidity null), `"bh1750"` (lux null), `"soil"` (implausible reading: soilRaw + soilMoisture null), `"soil_cal"` (calibration invalid: soilMoisture null, soilRaw sent). The backend logs changes |

`soilRaw` from the firmware is the sensor output in **millivolts** (`analogReadMilliVolts`, averaged over 1 s, typically 1000–2800 mV). The simulator sends mV too. The 0–4095 range is kept for compatibility. `soilMoisture` = `(soilDryMv − soilRaw) / (soilDryMv − soilWetMv) × 100`, clamped to 0–100. Capacitive sensors read *lower* when wetter.

- Unknown fields are ignored. Invalid messages (bad JSON, out of range, missing `fanOn`/`fanMode`) are dropped with a warning in the backend log.
- Recommended interval: **5–10 s**. Always send `intervalSec`, which drives offline detection.
- The device **should publish telemetry immediately** after applying a command or after the hysteresis switches the fan, so confirmations are fast. These extra messages don't change `intervalSec`.
- **Fan fail-safe (firmware):** in `auto`, if the device has had no valid air temperature for 60 s, it turns the fan **on** and keeps it on until a valid reading returns. So `fanOn: true` with `airTemp: null` and `errors: ["dht"]` is expected, not a bug.

### greenhouse/{deviceId}/status (device → backend)

Plain-text payload `online` or `offline`, **retained**, QoS 1.

- On connect, set the MQTT Last Will to this topic with payload `offline`, retained, QoS 1.
- Right after connecting, publish `online` (retained). The firmware's MQTT library (PubSubClient) can only publish QoS 0, so its `online` is QoS 0 retained, which is fine. Its Last Will is QoS 1.
- Before a planned shutdown, publish `offline` (retained), then disconnect cleanly. A clean disconnect does **not** trigger the Last Will.

### Online / offline

A device becomes **online** when the backend receives telemetry or a live `online` status from it.

**Retained status messages.** The broker replays these every time the backend (re)subscribes, and they can be days old, so the backend treats them with care:

- A retained `online` is ignored: the device may have died before its Last Will fired.
- A retained `offline` is applied, unless the backend has received live data from that device since the current broker connection started. In that case the retained message is older than what we know.
- Retained messages **never auto-register** a device, so old test devices don't come back after a restart.
- An empty retained payload (the retained message was cleared) is ignored.

To remove an old device's retained status from the broker: `mosquitto_pub -h localhost -t greenhouse/<id>/status -r -n`. Here `-r -n` means retained with an empty payload, which deletes it.

It becomes **offline** when either of these happens:

1. The status topic receives `offline`: the Last Will (connection lost) or a planned shutdown. A retained `offline` is applied as described above.
2. No message arrives for **3 telemetry intervals + 2 s** (`3 × intervalSec + 2`, e.g. 17 s at 5 s). If the device never sent `intervalSec`, the fallback is `OFFLINE_AFTER_SEC` (default 90 s). The backend checks every 2 s. Silence is counted only while the backend is connected to the broker: after a backend restart or a broker outage, devices get a full window to report before being marked offline.

Each online→offline transition emits `device:status` and creates **one** `offline` alert. Each offline→online transition emits `device:status`, creates one `online` info alert, and re-sends the fan thresholds. `offline`/`online` alerts are only created for devices that have sent live data before, never for a device that was just registered.

### greenhouse/{deviceId}/command (backend → device)

QoS 1, not retained. JSON with a unique `id` (UUID) and a `type`. The device should subscribe to it with QoS 1.

**setFanMode**

```json
{ "id": "6f1c2a9e-3b0d-4a51-9a39-2f3e7c1d8b44", "type": "setFanMode", "mode": "on", "issuedAt": "2026-11-09T10:15:00.000Z" }
```

**setFanThresholds**: the device validates the values (10–50 °C, on − off ≥ 1) and stores them in NVS.

```json
{ "id": "0b8e…", "type": "setFanThresholds", "fanOnTemp": 31, "fanOffTemp": 27.5, "issuedAt": "2026-11-09T10:16:00.000Z" }
```

The backend sends `setFanThresholds` after `PUT /thresholds` (if the device is online) and **every time a device comes online**, so the device copy always matches the backend's. The device confirms by applying the change and publishing telemetry that includes the new `fanOnTemp`/`fanOffTemp`; there is no separate ack topic. The backend stores these as `Device.reportedFanOnTemp/OffTemp` and emits `device:status` when they change.

**calibrateSoil**: the device stores its **current** averaged soil reading (mV) in NVS, as the dry point (`"dry"`, sensor in air = 0 %) or the wet point (`"wet"`, sensor in water = 100 %). It confirms with telemetry that includes the new `soilDryMv`/`soilWetMv`. If the current reading is invalid, the device ignores the command and logs why.

```json
{ "id": "a41f…", "type": "calibrateSoil", "point": "dry", "issuedAt": "2026-11-09T10:17:00.000Z" }
```

An invalid command (unknown `type`, values out of range) must be ignored by the device.

**Stale commands.** A device must ignore a command whose `issuedAt` is more than **30 s** in the past, if its clock is set (NTP). This matters after a broker or Wi-Fi outage: a QoS 1 command can be delivered late, and an old "fan on" shouldn't surprise anyone. The backend answers `503 BROKER_UNAVAILABLE` if the broker doesn't acknowledge a command within 5 s. The simulator follows this rule.

The backend reconnects to the broker forever, with exponential backoff and jitter (1 s → 30 s), and subscribes again on every connect.

### Auto-registration

The first valid **live** message (not a retained replay) for an unknown `{deviceId}` creates the device (name = id) with default thresholds.

### Data retention

Raw readings older than `READINGS_RETENTION_DAYS` (default **30**, matching the longest history range) are deleted once a day, starting 1 min after the backend starts. Alerts, fan events and thresholds are kept.

### Dev simulator

`npm run sim` (in `backend/`) acts as device `gh-01` on these exact topics and obeys these commands, using the same fan hysteresis as the firmware. Run `npm run sim -- --help` for the options.

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
- **Cooldown** (`ALERT_COOLDOWN_MIN`, default 15 min). A new episode is announced only if the last breach alert for that metric is at least 15 min old, **or** the new severity is higher than that alert's. Otherwise the episode stays silent. If it is still breached once the cooldown has passed, it is announced then.
- **Recovered.** When an announced episode ends, one `recovered` info alert is created. A silent episode ends silently.
- Alert state is rebuilt from the alert table after a backend restart, so a restart doesn't re-alert an open episode.

Changing thresholds takes effect on the next reading. Removing a limit (setting it to `null`) ends an open episode with `recovered`.

---

## 6. Push notifications (closed app)

Every new alert (§5) is sent two ways:

1. **App open:** the `alert` Socket.IO event (§3). The app shows a toast and refreshes the list and badge. A push that arrives while the app is in the foreground goes to the notification shade silently (no banner or sound), to avoid showing it twice.
2. **App closed or in the background:** a push via backend → Expo Push Service → FCM → Android. This needs internet on the laptop.

An alert is pushed when `enabled` is true and its severity ≥ `minSeverity` (`info` < `warning` < `critical`). With the default (`warning`), `recovered` and `online` alerts are not pushed. Recoveries are `info` and `offline` is `warning`. The cooldown and episodes of §5 already limit how often this happens.

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

- `title` is always "Greenhouse alert" (the same for every severity). `body` is `Alert.message`, which already says "very high"/"very low" for critical alerts.
- `channelId` `greenhouse-alerts` is the Android channel the app creates, named "Greenhouse alerts" (high importance, sound, vibration, shown on the lock screen). `priority: high` lets FCM wake a phone in Doze.
- `data.url` is the app route to open on tap. The app accepts only `/alerts`. Tapping the notification opens the Alerts tab, also when the app was killed.
- `ttl` is 24 h: a phone that is off longer than that doesn't get stale alerts.

**Clean-up.** Messages are sent in chunks of up to 100. If a push ticket, or a receipt (checked about 15 min later), says `DeviceNotRegistered`, that token is deleted. Other errors are logged. A failed request (no internet) is logged and never blocks alert creation.

**Backend env.** `PUSH_ENABLED=false` turns sending off. `EXPO_ACCESS_TOKEN` is needed only if "Enhanced push security" is on in the Expo project.

---

## 7. SMS alerts (owner's phone)

For the situations that need action, the backend also sends **one SMS to the owner's number**. It needs internet on the laptop and credit with the SMS provider, and it works only while the backend runs. Push notifications (§6) stay the everyday channel; SMS is for emergencies.

**What is sent** (only when `enabled` and a number is saved):

| Situation | SMS |
|---|---|
| A reading becomes **critical** (`severity: "critical"`, §5) for air temperature, humidity, soil moisture or light | One SMS when it starts. Warnings are push only |
| Air temperature **critical high** | The same SMS says what the fan is doing, as last **confirmed by the device**: `Fan ON (auto)`, `Fan ON (manual)`, `Fan is OFF (manual). Turn it on in the app!` or `Fan is OFF but should be running. Check it!` |
| The greenhouse is **offline for more than `offlineAfterMin` minutes** | One SMS (not for an outage older than 24 h). The fan keeps running on its own, and the SMS says so |
| The situation is **over** | One closing SMS (below) |

**Closing SMS.** Every announced situation gets exactly one:

- Humidity, soil, light: when the `recovered` alert (§5) arrives.
- Air temperature: **"stabilized" = the fan switched OFF** after the temperature came back in range (`Fan turned OFF`). While the temperature is back in range but the fan still runs in auto mode, nothing is sent. If the fan is held on by hand, or is already off, the closing SMS is sent at once and says `Fan still ON (manual)` / `Fan is OFF`. If the fan hasn't switched off 2 hours after the recovery, it closes with `Fan still ON (auto)`.
- Offline: when the device is back online.

**Rules that limit cost and noise:**

- A situation is announced **once**: no repeats while it stays critical. It is remembered in the database, so a backend restart neither repeats an SMS nor loses the closing one. It exists only if its opening SMS was actually sent, so a failed send is retried by the next critical alert.
- A situation that has been open for 48 h (offline: 24 h) is closed silently, so a stale "all clear" is never sent.
- **Daily cap:** at most `SMS_DAILY_CAP` (default 10) alert SMS per rolling 24 hours. Over the cap the SMS is skipped and logged (`status: "skipped"`). Test SMS don't count.
- Sending never blocks or breaks alert creation; failures are logged and shown as `last` in `GET /api/sms/settings`.

**Texts.** Plain ASCII, at most 160 characters, so every alert is a single message (the degree sign and other special characters would force a 70-character mode). Units are `C`, `%` and `lux`. The device name is shortened to 20 characters. Times are Asia/Manila.

```
ETanim CRITICAL: Air temp 38.4 C (max 35). Fan ON (auto). Greenhouse 01
ETanim OK: Air temp back to 28 C. Fan turned OFF. Greenhouse 01
ETanim CRITICAL: Humidity 97.3 % (max 85). Greenhouse 01
ETanim ALERT: Greenhouse 01 offline for 12 min (last seen 14:05). The fan keeps running on its own.
ETanim OK: Greenhouse 01 is back online.
```

**Backend env** (`backend/.env`, see `docs/setup-sms.md`):

| Variable | Default | Meaning |
|---|---|---|
| `SMS_PROVIDER` | `console` | `console` = test mode (log only). `semaphore` = real SMS through semaphore.co |
| `SEMAPHORE_API_KEY` | none | Secret; required with `semaphore`. Never returned by the API, never logged |
| `SEMAPHORE_SENDER_NAME` | account default | Registered sender name (max 11 characters) |
| `SMS_DAILY_CAP` | `10` | Alert SMS per rolling 24 hours |

The owner's number and the on/off switch are **not** in `.env`: they are set in the app (Settings → SMS alerts) and stored in the backend database. The phone number is stored on the laptop only and never written to logs in full (`+63••••••4567`).
