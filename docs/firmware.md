# ESP32 firmware

Arduino IDE sketch in `firmware/SmartGreenhouse/`: ESP32 DevKit (30-pin), Arduino-ESP32 core **4.0.0**. It reads the sensors (it keeps reading them without Wi-Fi) and sends a reading every **30 s**, exactly as in [api-contract.md §2 and §4](api-contract.md):

- over **MQTT** (main): published to `greenhouse/gh-01/telemetry` on the EMQX broker over TLS ([setup-emqx.md](setup-emqx.md)); retained `online`/`offline` (Last Will) on `greenhouse/gh-01/status`; commands from `greenhouse/gh-01/command`;
- over **HTTPS** (fallback, automatic): `POST SERVER_URL/api/readings` whenever MQTT isn't connected;
- plus `GET SERVER_URL/health` every 10 min while on MQTT, which keeps Render's free backend awake.

The work is split in two:

- `loop()` (core 1) handles sensors, the LED, the serial console and commands. Every job runs on its own `millis()` timer; there's no `delay()`, and it never waits for the network.
- A separate task (core 0) handles Wi-Fi, time (NTP), MQTT and HTTPS. A slow TLS handshake, a broker that doesn't answer or a sleeping server can block it for up to 20 s, never the sensor reading.

All files below are in `firmware/SmartGreenhouse/` and show up as tabs in Arduino IDE.

| File | Job |
|---|---|
| `SmartGreenhouse.ino` | Empty on purpose (Arduino IDE opens this file). Lists the core/library versions and Tools settings |
| `main.cpp` | `setup()` and `loop()` |
| `config.h` | Pins, the reading interval (`READING_INTERVAL_MS`, the one place to change it), timeouts, defaults |
| `secrets.example.h` | Template for `secrets.h`: Wi-Fi, MQTT broker + login, server URL, device key |
| `secrets.h` | **Yours, git-ignored.** Copy of the template with your values |
| `settings.*` | NVS: device id, soil dry/wet mV |
| `sensors.*` | DHT22, BH1750, soil (16-sample average, calibration → %) |
| `uplink.*` | Wi-Fi (auto-reconnect), NTP, MQTT (PubSubClient over TLS, Last Will, command topic), the HTTPS fallback and the keep-awake ping |
| `mqtt_ca.h` | The broker's root certificate (DigiCert Global Root G2, EMQX's CA): the ESP32 verifies EMQX before sending its password |
| `commands.*` | Commands from the backend (MQTT message or HTTPS answer, JSON → validated), apply them, save to NVS, acknowledge with a reading |
| `console.*`, `shared.*` | Serial console; safe hand-off between the two cores |

`firmware/bringup/test_*/` holds standalone test sketches, one per sensor (see "Bring-up tests"). `firmware/platformio.ini` is optional: it lets PlatformIO build the same `SmartGreenhouse/` folder.

## Wiring

| Part | Part pin | ESP32 | Notes |
|---|---|---|---|
| DHT22 | VCC / DATA / GND | 3V3 / **GPIO27** / GND | Bare 4-pin sensor: 10 kΩ from DATA to 3V3. Modules usually have it |
| BH1750 | VCC / GND / SDA / SCL / ADDR | 3V3 / GND / **GPIO21** / **GPIO22** / GND or open | Address 0x23 |
| Soil v1.2 | VCC / GND / AOUT | **3V3** / GND / **GPIO34** | Power from **3.3 V**: at 5 V its output can exceed what the ADC reads |

- **Common ground:** ESP32 GND and every sensor GND must be connected.
- **GPIO34** is input-only and on ADC1, so it keeps working while Wi-Fi is on (ADC2 pins don't).
- **On-board LED (GPIO2):**
  - slow blink = no Wi-Fi
  - double blink = Wi-Fi OK but neither MQTT nor HTTPS works (broker refused, server asleep, wrong URL or key)
  - on, with a short blink-off every 2 s = online over **HTTPS** (MQTT fallback)
  - steady = online over **MQTT**

## Install Arduino IDE and flash

Tested with Arduino IDE 2.3. One-time setup (steps 1–5), then steps 6–8 every time you flash.

**Disk space:** the ESP32 board package needs roughly **5 GB free on C:** while it installs.

1. **ESP32 board package URL:** File → Preferences (Ctrl+,) → *Additional boards manager URLs* → paste
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json` → OK.
2. **Install the core:** Tools → Board → Boards Manager (Ctrl+Shift+B) → search `esp32` → **"esp32 by Espressif Systems"** (not "Arduino ESP32 Boards") → version **4.0.0** → INSTALL. The firmware was compiled with 4.0.0 (2026-11-27). The old 2.0.17 pin was only needed for WiFiManager, which is gone; other versions were not compiled.
3. **Install the libraries:** Tools → Manage Libraries (Ctrl+Shift+I). For each row: search the name, find the right author, pick the version, INSTALL.

   | Search | Pick (author) | Version |
   |---|---|---|
   | `DHT sensor library` | DHT sensor library (Adafruit) | 1.4.7 |
   | `Adafruit Unified Sensor` | Adafruit Unified Sensor (Adafruit) | 1.1.15 |
   | `BH1750` | BH1750 (Christopher Laws) | 1.3.0 |
   | `ArduinoJson` | ArduinoJson (Benoit Blanchon) | 7.4.3 |
   | `PubSubClient` | PubSubClient (Nick O'Leary) | 2.8 |

   Wi-Fi, HTTPS (`WiFiClientSecure`) and `HTTPClient` come with the core. WiFiManager is no longer used; uninstalling it is optional.
4. **USB driver:** connect the ESP32 with a **data** USB cable (some cables are charge-only). If Windows shows no new COM port (Device Manager → Ports (COM & LPT)), install the driver for the board's USB chip: **CP210x** (Silicon Labs) or **CH340** (WCH). This laptop's board is a CP2102 on **COM10**; COM3–COM8 are Bluetooth, not the board.
5. **Secrets:** in `firmware\SmartGreenhouse\`, copy `secrets.example.h` to **`secrets.h`** (PowerShell: `Copy-Item firmware\SmartGreenhouse\secrets.example.h firmware\SmartGreenhouse\secrets.h`) and fill in:
   - `WIFI_SSID`, `WIFI_PASSWORD`: a **2.4 GHz** network (the ESP32 can't see 5 GHz). For a demo, a phone hotspot works (on Android: Hotspot → *Extend compatibility* / 2.4 GHz band).
   - `MQTT_HOST`, `MQTT_PORT` (8883), `MQTT_USERNAME`, `MQTT_PASSWORD`: the EMQX deployment's address and the **device's** login ([setup-emqx.md](setup-emqx.md) steps 1–2, 5). `MQTT_HOST ""` = HTTPS only. An older `secrets.h` without these lines still compiles (HTTPS only, with a note in the compiler output).
   - `SERVER_URL`: the deployed backend, e.g. `https://etanim-api.onrender.com` (no trailing slash). Used for the fallback and the keep-awake ping.
   - `DEVICE_KEY`: exactly the backend's `DEVICE_API_KEY` (Render → your service → Environment).

   `secrets.h` is git-ignored: it never gets committed. Without it, compiling stops with "secrets.h is missing".
6. **Open the sketch:** File → Open → `firmware\SmartGreenhouse\SmartGreenhouse.ino`. All the `.cpp`/`.h` files open as tabs.
7. **Board settings** (Tools menu; the IDE remembers them):
   - Board → esp32 → **ESP32 Dev Module**
   - Port → **COM10** (the one that appears when you plug the board in)
   - Core Debug Level → **Error**
   - Erase All Flash Before Sketch Upload → **Disabled** (Enabled would wipe the calibration)
   - Everything else at its default (Partition Scheme "Default 4MB with spiffs": the firmware uses about **90 %** of it; if a later change doesn't fit, pick **Huge APP**).
8. **Compile, flash, watch:** ✓ **Verify** (Ctrl+R) compiles only; → **Upload** (Ctrl+U) compiles and flashes. The first compile takes several minutes. Then Tools → **Serial Monitor** (Ctrl+Shift+M): **115200 baud** and **New Line**, and type `help`.

- "Multiple libraries were found for WiFi.h" in the output is information, not an error.
- If the upload stalls at `Connecting....`, hold **BOOT** until the percentage starts.
- Flashing keeps the NVS data (device id, calibration) unless *Erase All Flash* is enabled. Wi-Fi, broker, server and key come from `secrets.h`, so changing them means editing it and uploading again.

## Bring-up tests

Small sketches in `firmware/bringup/` that test **one part at a time**, without Wi-Fi or server. Each is its own sketch: File → Open → `firmware\bringup\test_dht\test_dht.ino` (or another), same board settings, Upload, Serial Monitor at 115200. Afterwards, open `SmartGreenhouse.ino` again and Upload the main firmware.

| Sketch | What it prints |
|---|---|
| `test_dht` | DHT22: T/RH every 2.5 s, or FAIL (NaN) with hints |
| `test_soil` | Soil: averaged mV every second + OK / TOO HIGH / NOISY |
| `test_bh1750` | BH1750: I2C scan until found, then lux every second |
| `test_i2c_lines` | BH1750 power and wire contact without a multimeter: reads GPIO21/22 with the internal pull-down and pull-up and reports whether the module pulls the lines up |

Each test sketch has its own copy of the pins it needs; if you change a pin in `config.h`, change it there too.

## First start

1. Fill in `secrets.h` (step 5) and upload.
2. In the Serial Monitor: `[wifi] connected to "…"`, then `[mqtt] connecting …` and `[mqtt] connected; readings go to greenhouse/gh-01/telemetry …`, and the first reading goes out. The LED turns steady.
3. Right after connecting it sends `GET /health`, which wakes a sleeping Render service (about a minute); until it's up, MQTT readings reach the broker but nobody stores them. A failed ping logs `keep-awake GET /health: error …` and is retried after 60 s. On the HTTPS fallback, the first POST can time out instead (`POST failed: read Timeout`); the board retries every **10 s**.
4. If MQTT can't connect (`[mqtt] connect failed (state …)`), readings go over HTTPS at once (LED on with a short blink-off) and MQTT is retried after 10 s, 20, 40, 80, then every 2 min.
5. The app shows the greenhouse after its first reading (device id `gh-01`); Settings → Device shows **Data link · MQTT (EMQX broker)**.

**MQTT over TLS:** the board **verifies** the broker's certificate (root in `mqtt_ca.h`, valid until 2038), so the MQTT password only goes to the real EMQX. For another broker, replace the certificate, or `#define MQTT_TLS_INSECURE 1` in `secrets.h` (encrypted, not verified). `MQTT_PORT 1883` uses plain TCP: only for a broker on your own laptop.

**HTTPS:** the connection is encrypted, but the board doesn't verify the server's certificate (`setInsecure()`), so someone on the same network could impersonate the server. `uplink.cpp` says how to pin the server's root CA with `setCACert()` and how to export the certificate from a browser.

## Serial console

Type in the serial monitor (115200 baud, line ending **New Line**, press Enter).

| Command | What it does |
|---|---|
| `help` | List commands |
| `status` | Settings, Wi-Fi, MQTT (connected, readings sent, last failure), HTTPS (fallback readings ok/failed, last status, last keep-awake ping), sensor values, free memory |
| `watch` | Toggle raw sensor values every second |
| `post` | Send a reading now (MQTT, or HTTPS as fallback) |
| `cal dry` / `cal wet` | Capture the soil calibration point now |
| `cal 2600 1200` | Set dry/wet mV directly |
| `id <deviceId>` | Greenhouse id (default `gh-01`), also in the MQTT topics; reboots to use it. Update the EMQX authorization rules if you use them |
| `factory` | Erase saved settings and reboot |
| `reboot` | Restart |

## Calibrate the soil sensor

The sensor's output voltage drops as the soil gets wetter. Calibration stores two points in NVS. The defaults are typical values (dry 2600 mV, wet 1200 mV); your sensor will differ.

1. **Dry point:** hold the sensor **in air**, dry and clean. Run `watch` and wait until the soil mV is steady (spread under ~50 mV). Then `cal dry`.
2. **Wet point:** put the sensor **in a glass of water** up to the line on the PCB, never above it. Wait 30 s. Then `cal wet`.
3. **Check:** `status`. In air it should read ~0 %, in water ~100 %, and in your pot somewhere between.

Without a serial cable, use the app (Control → Moisture calibration). Over MQTT the command arrives on `greenhouse/gh-01/command` within a second; on the HTTPS fallback it waits on the server and comes with the answer to the next reading (within 30 s). The board then sends a reading right away with the new values, which is the app's confirmation.

## What the board sends

- Every **30 s**, one reading (JSON as in the contract: `deviceId`, `temperature`, `humidity`, `soilMoisture`, `lux`, `soilRaw` (mV), `rssi`, `intervalSec` (30), `uptimeSec`, `soilDryMv`, `soilWetMv`, plus `ts` once NTP has synced):
  - published on `greenhouse/<id>/telemetry` (QoS 0, PubSubClient's only option for publishing), or
  - if MQTT isn't connected or the publish fails: `POST SERVER_URL/api/readings` with `X-Device-Key`. Never both.
- On connecting to the broker: retained `online` on `greenhouse/<id>/status`, with the Last Will retained `offline` (the broker publishes it ~30 s after the link dies: 1.5 × the 20 s keep-alive); subscribes to `greenhouse/<id>/command` (QoS 1).
- While on MQTT: `GET SERVER_URL/health` every 10 min (keeps Render awake). It blocks the task for at most 16 s, under MQTT's keep-alive.
- A failed sensor is sent as `null`, never a made-up number, plus `errors: ["dht"]` (or `bh1750`, `soil`, `soil_cal`). The DHT22 keeps its last real reading for at most two failed reads (5 s) before it reports `null`. The other sensors keep working.
- An extra reading right after a calibration change (the acknowledgement).
- Commands (MQTT message or HTTPS answer) older than 150 s are ignored (when the clock is set), and so are unknown types and invalid values; each is logged.
- A failed HTTPS reading is retried after 10 s; a lost MQTT connection is retried after 2 s, then with backoff; Wi-Fi reconnects by itself, and the board re-joins every 15 s if that fails.

## Troubleshooting

| Symptom (serial log) | Likely cause / fix |
|---|---|
| Nothing in the monitor, or garbage | Wrong baud (must be 115200), or the monitor opened before boot: press **EN** (reset) |
| `[wifi] connecting to "…"` repeats | Wrong SSID/password in `secrets.h`, a 5 GHz-only network or hotspot (needs 2.4 GHz), or weak signal (`status` shows RSSI; below about −80 dBm is unreliable) |
| `POST failed: read Timeout` / `connection refused` once or twice, then OK | The free server was asleep and is starting: normal, the board retries every 10 s |
| `POST failed: …` keeps repeating | `SERVER_URL` wrong (must start with `https://`, no trailing slash), the service is down (open `SERVER_URL/health` in a browser), or no internet on that Wi-Fi |
| `401: wrong device key` | `DEVICE_KEY` in `secrets.h` ≠ `DEVICE_API_KEY` on the server (check for spaces), then upload again |
| `400: the server rejected the reading` | A value out of range: the log line shows which field |
| `[mqtt] connect failed (state -2: TCP/TLS connection failed …)` | `MQTT_HOST` wrong (the Address only, no `mqtts://`), `MQTT_PORT` not 8883, or this Wi-Fi blocks port 8883 (school networks often do: it falls back to HTTPS; a phone hotspot usually allows it). A `TLS:` part names a certificate problem |
| `[mqtt] connect failed (state 4 or 5: login refused …)` | `MQTT_USERNAME`/`MQTT_PASSWORD` ≠ the device login in EMQX → Access Control → Authentication |
| MQTT connected but calibration from the app never arrives | EMQX authorization doesn't allow the device to subscribe to `greenhouse/<id>/command` |
| `keep-awake GET /health: error …` repeating | `SERVER_URL` wrong, or the backend is down; readings still reach the broker but aren't stored |
| `secrets.h is missing` when compiling | Step 5 |
| `ERROR DHT22 not answering` / NaN in `test_dht` | Sensor not plugged in or a jumper not seated; DATA not on GPIO27; "+" and "−" swapped; bare sensor without its 10 kΩ pull-up. Wait 2 s after power-up |
| `ERROR BH1750 not found on I2C` | SDA/SCL swapped (21/22), no 3.3 V, or ADDR pulled high (0x5C). It retries every 10 s |
| `ERROR soil sensor reading implausible` | AOUT not on GPIO34 or loose (floating pin = noisy); powered from 5 V (> 3.1 V) |
| Soil % stuck at 0 or 100 | Calibration points swapped or not done: `cal dry` in air, `cal wet` in water |
| App shows the device offline but the log says online | Different device id than the app expects, or two boards with the same id |
| Upload fails: `Failed to connect` | Hold BOOT during "Connecting…", use a data cable, pick the right port (COM10), close other serial programs |
| Compile error `xyz.h: No such file or directory` | That library isn't installed (step 3), or a look-alike from another author |
| `Sketch too big` | Tools → Partition Scheme → **Huge APP** |
| No COM10 / port list empty | Charge-only cable, missing CP210x driver, or the board was unplugged |
