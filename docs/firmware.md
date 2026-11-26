# ESP32 firmware

Arduino IDE sketch in `firmware/SmartGreenhouse/`: ESP32 DevKit (30-pin), Arduino-ESP32 core **2.0.17**. It reads the sensors (it keeps reading them without Wi-Fi) and talks MQTT exactly as in [api-contract.md §4](api-contract.md).

The work is split in two:

- `loop()` (core 1) handles sensors, the BOOT button, the LED, the serial console and commands. Every job runs on its own `millis()` timer; there's no `delay()`, and it never waits for the network.
- A separate task (core 0) handles Wi-Fi, MQTT, time (NTP) and the setup portal. It makes one reconnect attempt every **5 s** (a Wi-Fi attempt may take up to 10 s to associate).

All files below are in `firmware/SmartGreenhouse/` and show up as tabs in Arduino IDE.

| File | Job |
|---|---|
| `SmartGreenhouse.ino` | Empty on purpose (Arduino IDE opens this file). Lists the exact core/library versions and Tools settings |
| `main.cpp` | `setup()` and `loop()` |
| `config.h` | Pins, timings, defaults, MQTT topic templates |
| `settings.*` | NVS: device id, broker host/port, soil dry/wet mV |
| `sensors.*` | DHT22, BH1750, soil (16-sample average, calibration → %) |
| `network.*` | Wi-Fi + portal, MQTT, telemetry JSON, NTP |
| `commands.*` | Parse MQTT commands (JSON → validated), apply them, save to NVS, acknowledge via telemetry |
| `console.*`, `shared.*` | Serial console; safe hand-off between the two cores |

`firmware/bringup/test_*/` holds standalone test sketches, one per sensor (see "Bring-up tests"). `firmware/platformio.ini` is optional: it lets PlatformIO build the same `SmartGreenhouse/` folder with the same versions.

## Wiring

| Part | Part pin | ESP32 | Notes |
|---|---|---|---|
| DHT22 | VCC / DATA / GND | 3V3 / **GPIO27** / GND | Bare 4-pin sensor: 10 kΩ from DATA to 3V3. Modules usually have it |
| BH1750 | VCC / GND / SDA / SCL / ADDR | 3V3 / GND / **GPIO21** / **GPIO22** / GND or open | Address 0x23 |
| Soil v1.2 | VCC / GND / AOUT | **3V3** / GND / **GPIO34** | Power from **3.3 V**: at 5 V its output can exceed what the ADC reads |

- **Common ground:** ESP32 GND and every sensor GND must be connected.
- **GPIO34** is input-only and on ADC1, so it keeps working while Wi-Fi is on (ADC2 pins don't).
- **On-board LED (GPIO2):**
  - fast blink = setup portal open
  - slow blink = no Wi-Fi
  - double blink = Wi-Fi OK but no MQTT
  - steady = online

## Install Arduino IDE and flash

Tested with Arduino IDE 2.3. One-time setup (steps 1–4), then step 5–7 every time you flash.

**Disk space:** the ESP32 board package needs roughly **5 GB free on C:** while it installs (downloads + unpacked toolchains). If you no longer use PlatformIO, uninstall the *PlatformIO IDE* extension in VS Code first (otherwise it reinstalls itself), then delete `C:\Users\<you>\.platformio` (several GB).

1. **ESP32 board package URL:** File → Preferences (Ctrl+,) → *Additional boards manager URLs* → paste
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json` → OK.
2. **Install the core, version 2.0.17:** Tools → Board → Boards Manager (Ctrl+Shift+B) → search `esp32` → the entry **"esp32 by Espressif Systems"** (not "Arduino ESP32 Boards") → in its version dropdown pick **2.0.17** → INSTALL. Takes several minutes. Don't take 3.x: the firmware is built and tested on 2.0.17, and 3.x changed several APIs. Later, if the IDE offers an "update" for esp32, ignore it.
3. **Install the libraries, exact versions:** Tools → Manage Libraries (Ctrl+Shift+I). For each row: search the name, find the right author, pick the version in the dropdown, INSTALL.

   | Search | Pick (author) | Version |
   |---|---|---|
   | `DHT sensor library` | DHT sensor library (Adafruit) | 1.4.7 |
   | `Adafruit Unified Sensor` | Adafruit Unified Sensor (Adafruit) | 1.1.15 |
   | `BH1750` | BH1750 (Christopher Laws) | 1.3.0 |
   | `PubSubClient` | PubSubClient (Nick O'Leary) | 2.8 |
   | `ArduinoJson` | ArduinoJson (Benoit Blanchon) | 7.4.3 |
   | `WiFiManager` | WiFiManager (tzapu) | 2.0.17 |

   When DHT asks about dependencies, *INSTALL ALL* is fine (it adds Adafruit Unified Sensor); check that it ends up at 1.1.15. Several libraries have look-alike names (`PubSubClient3`, `ESP_WiFiManager`, `hp_BH1750`…): check the author column.
4. **USB driver:** connect the ESP32 with a **data** USB cable (some cables are charge-only). If Windows shows no new COM port (Device Manager → Ports (COM & LPT)), install the driver for the USB chip on your board: **CP210x** (Silicon Labs) or **CH340** (WCH). This laptop's board is a CP2102 on **COM10**; COM3–COM8 are Bluetooth, not the board.
5. **Open the sketch:** File → Open → `firmware\SmartGreenhouse\SmartGreenhouse.ino`. All the `.cpp`/`.h` files open as tabs.
6. **Board settings** (Tools menu; the IDE remembers them):
   - Board → esp32 → **ESP32 Dev Module**
   - Port → **COM10** (the one that appears when you plug the board in)
   - Core Debug Level → **Error**
   - Erase All Flash Before Sketch Upload → **Disabled** (Enabled would wipe Wi-Fi, broker and calibration)
   - Everything else stays at its default (Upload Speed 921600, Partition Scheme "Default 4MB with spiffs").
7. **Compile, flash, watch:** ✓ **Verify** (Ctrl+R) compiles only; → **Upload** (Ctrl+U) compiles and flashes. The first compile takes a few minutes, later ones are faster. Then Tools → **Serial Monitor** (Ctrl+Shift+M): set **115200 baud** and **New Line** in the two dropdowns, and type `help`.

- "Multiple libraries were found for WiFi.h" in the output is information, not an error.
- If the upload stalls at `Connecting....`, hold **BOOT** until the percentage starts. Some boards need it.
- The Serial Monitor can stay open: the IDE releases the port during the upload and reconnects after. Other programs (PuTTY, a PlatformIO monitor) must be closed.
- Flashing keeps the NVS data: Wi-Fi, broker, device id and calibration survive a reflash (unless *Erase All Flash* is enabled).

## Bring-up tests

Small sketches in `firmware/bringup/` that test **one part at a time**, without Wi-Fi or MQTT. Each is its own sketch: File → Open → `firmware\bringup\test_dht\test_dht.ino` (or another), same board settings, Upload, Serial Monitor at 115200. Afterwards, open `SmartGreenhouse.ino` again and Upload the main firmware.

| Sketch | What it prints |
|---|---|
| `test_dht` | DHT22: T/RH every 2.5 s, or FAIL (NaN) with hints |
| `test_soil` | Soil: averaged mV every second + OK / TOO HIGH / NOISY |
| `test_bh1750` | BH1750: I2C scan until found, then lux every second |
| `test_i2c_lines` | BH1750 power and wire contact without a multimeter: reads GPIO21/22 with the ESP32's internal pull-down and pull-up and reports whether the module pulls the lines up |

Each test sketch has its own copy of the pins it needs (a sketch can't include files from another sketch folder); if you change a pin in `config.h`, change it there too. The main firmware's serial console (`status`, `watch`) covers the same checks once everything is wired.

## First start: Wi-Fi + broker (setup portal)

With no Wi-Fi saved, the board opens a **setup portal** by itself. The sensors keep being read meanwhile.

**The one rule:** the ESP32, the laptop and the phone must be on the **same router**. The ESP32 needs that router's **2.4 GHz** network (it can't see 5 GHz); the laptop and phone may use either band of the same router.

1. **Join the board's network:** on your phone, join Wi-Fi **`Greenhouse-Setup-XXXX`** (XXXX = end of the board's MAC, e.g. `6BD4`), password **`greenhouse`**. If Android warns "no internet", stay connected. If the setup page doesn't pop up, open <http://192.168.4.1>.
2. **Broker settings first:** tap **Setup** and set:
   - **MQTT broker host**: the laptop's LAN IP, e.g. `192.168.50.69` (`ipconfig` → Wireless LAN adapter Wi-Fi → IPv4 Address)
   - **MQTT port**: `1883`
   - **Device ID**: `gh-01`. Use another id if the simulator still runs as gh-01, or stop the simulator.

   Then **Save** and go back to the menu.
3. **Wi-Fi:** tap **Configure WiFi**, pick your **2.4 GHz** network, enter its password and **Save**. The portal closes and the board joins your network.
4. **Laptop network profile:** Windows must treat this Wi-Fi as **Private**, or its firewall blocks MQTT. Settings → Network & internet → Wi-Fi → (network) → Network profile type → Private. Or, in an Administrator PowerShell: `Set-NetConnectionProfile -Name "<network name>" -NetworkCategory Private`.
5. **Check it connected:** the serial log shows `[wifi] connected …` and `[mqtt] connected; subscribed to greenhouse/gh-01/command`. The LED turns steady.

**Changing Wi-Fi or laptop IP later:** hold the **BOOT** button for **3 s** while the board runs (not during reset: BOOT + reset enters flash mode). The LED blinks fast and the portal opens: **Configure WiFi** replaces the saved network, **Setup** changes the broker host. Or use the serial commands `portal` / `mqtt 192.168.1.50`. No reflash needed. The portal closes by itself after 5 min. If the saved Wi-Fi is gone, the board keeps retrying it; it does **not** reopen the portal by itself, so use BOOT.

A new network almost always means a **new laptop IP**: update it on the board (above) **and** in the app (Settings → Server → Backend address). Reserve the laptop's IP in the router (DHCP reservation) so this doesn't happen after every reboot.

## Serial console

Type in the serial monitor (115200 baud, line ending **New Line**, press Enter). With "No Line Ending" the board never sees the end of a command and nothing happens.

| Command | What it does |
|---|---|
| `help` | List commands |
| `status` | Settings, Wi-Fi/MQTT state, sensor values, free memory |
| `watch` | Toggle raw sensor values every second |
| `cal dry` / `cal wet` | Capture the soil calibration point now |
| `cal 2600 1200` | Set dry/wet mV directly |
| `mqtt <host> [port]`, `id <deviceId>` | Broker address / device id |
| `portal` | Open the setup portal |
| `factory` | Erase saved settings (not Wi-Fi) and reboot |
| `reboot` | Restart |

## Calibrate the soil sensor

The sensor's output voltage drops as the soil gets wetter. Calibration stores two points in NVS. The defaults are typical values (dry 2600 mV, wet 1200 mV); your sensor will differ.

1. **Dry point:** hold the sensor **in air**, dry and clean. Run `watch` and wait until the soil mV is steady (spread under ~50 mV). Then `cal dry`.
2. **Wet point:** put the sensor **in a glass of water** up to the line on the PCB, never above it (the electronics must stay dry). Wait 30 s. Then `cal wet`.
3. **Check:** `status`. In air it should read ~0 %, in water ~100 %, and in your pot somewhere between.

Without a serial cable, the backend can trigger the same capture: `curl.exe -X POST -H "Content-Type: application/json" -d "{\"point\":\"dry\"}" http://localhost:4000/api/devices/gh-01/soil-calibration`. Use `wet` for the second point.

## What the board sends

- Every **5 s**, telemetry as in the contract (`airTemp`, `humidity`, `soilMoisture`, `soilRaw` in mV, `lux`, `rssi`, `intervalSec`, `uptimeSec`, `soilDryMv`, `soilWetMv`, plus `ts` once NTP has synced).
- An extra message right after any command, so the app confirms quickly.
- A failed sensor sends `null` plus `errors: ["dht"]` (or `bh1750`, `soil`, `soil_cal`). The others keep working.
- Retained `online` on connect. The Last Will `offline` (retained) is published by the broker if the board disappears.
- Commands older than 30 s are ignored (contract §4). Malformed JSON, unknown types and invalid values are logged and ignored.

## Troubleshooting

| Symptom (serial log) | Likely cause / fix |
|---|---|
| Nothing in the monitor, or garbage | Wrong baud (must be 115200), or the monitor opened before boot: press **EN** (reset) |
| `[wifi] connecting…` repeats | Wrong Wi-Fi password, 5 GHz-only network (ESP32 needs 2.4 GHz), or weak signal (`status` shows RSSI; below about −80 dBm is unreliable: move the board or router closer). Hold BOOT 3 s → portal |
| `[mqtt] connect failed (state -2: broker unreachable …)`: check in this order | 1. **Same router?** The laptop must be on the board's network (`netsh wlan show interfaces` shows the laptop's SSID). 2. **Broker IP current?** `ipconfig` on the laptop vs `mqtt broker` in `status`; fix with `mqtt <ip>` or the portal. 3. **Mosquitto running?** `Get-Service mosquitto`. 4. **Firewall:** the laptop's Wi-Fi profile must be **Private** (`Get-NetConnectionProfile`), and ports 1883/4000 allowed (docs/setup-mosquitto.md) |
| `connect failed (state 5)` | Broker requires a login. Our Mosquitto config uses `allow_anonymous true` on the LAN listener |
| `ERROR DHT22 not answering` / NaN in `test_dht` | Sensor not plugged in or a jumper not fully seated; DATA ("out") not on the S pin of the GPIO27 row; "+" and "−" swapped; bare sensor without its 10 kΩ pull-up. Wait 2 s after power-up. Some modules want "+" on 5 V (data stays on GPIO27) |
| `ERROR BH1750 not found on I2C` | SDA/SCL swapped (21/22), no 3.3 V, or ADDR pulled high (0x5C). It retries every 10 s |
| `ERROR soil sensor reading implausible` | AOUT not on GPIO34 or loose (floating pin = noisy); powered from 5 V (> 3.1 V) |
| Soil % stuck at 0 or 100 | Calibration points swapped or not done: `cal dry` in air, `cal wet` in water |
| App shows the device offline but the log says online | Different device id than the app/simulator, or two boards with the same id |
| Upload fails: `Failed to connect` | Hold BOOT during "Connecting…", use a data cable, pick the right port (COM10, not a Bluetooth COM port), close other serial programs |
| Compile error `xyz.h: No such file or directory` | That library isn't installed (step 3), or a look-alike library from another author was installed instead |
| Compile errors inside the esp32 core or a library, or odd behaviour after an IDE update | Check the core version: Boards Manager → esp32 by Espressif Systems must say **2.0.17 installed**. If it's 3.x, select 2.0.17 → INSTALL (replaces it) |
| No COM10 / port list empty | Charge-only cable, missing CP210x driver, or the board was unplugged; the port may get another number on another USB socket |
