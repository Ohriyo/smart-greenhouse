# ESP32 firmware

PlatformIO project in `firmware/`: ESP32 DevKit (30-pin), Arduino framework. It reads the sensors, runs the fan hysteresis **locally** (it works without Wi-Fi), and talks MQTT exactly as in [api-contract.md §4](api-contract.md).

The work is split in two:

- `loop()` (core 1) handles sensors, the fan, the BOOT button, the LED, the serial console and commands. Every job runs on its own `millis()` timer; there's no `delay()`, and it never waits for the network.
- A separate task (core 0) handles Wi-Fi, MQTT, time (NTP) and the setup portal. It makes one reconnect attempt every **5 s** (a Wi-Fi attempt may take up to 10 s to associate).

| File | Job |
|---|---|
| `include/config.h` | Pins, timings, default thresholds, MQTT topic templates |
| `src/settings.*` | NVS: device id, broker host/port, fan thresholds, fan mode, soil dry/wet mV, fan output polarity |
| `src/sensors.*` | DHT22, BH1750, soil (16-sample average, calibration → %) |
| `src/fan.*` | Hysteresis, manual override, fail-safe, OFF at boot |
| `src/network.*` | Wi-Fi + portal, MQTT, telemetry JSON, NTP |
| `src/commands.*` | Parse MQTT commands (JSON → validated), apply them, save to NVS, acknowledge via telemetry |
| `src/console.*`, `src/shared.*` | Serial console; safe hand-off between the two cores |
| `src/bringup/` | Standalone test sketches, one per sensor/output (see "Bring-up tests") |

## Wiring

| Part | Part pin | ESP32 | Notes |
|---|---|---|---|
| DHT22 | VCC / DATA / GND | 3V3 / **GPIO27** / GND | Bare 4-pin sensor: 10 kΩ from DATA to 3V3. Modules usually have it |
| BH1750 | VCC / GND / SDA / SCL / ADDR | 3V3 / GND / **GPIO21** / **GPIO22** / GND or open | Address 0x23 |
| Soil v1.2 | VCC / GND / AOUT | **3V3** / GND / **GPIO34** | Power from **3.3 V**: at 5 V its output can exceed what the ADC reads |
| Fan, relay module | VCC / GND / IN | 5V (VIN) / GND / **GPIO26** | Usually active-LOW: see "Relay vs MOSFET" |
| Fan, MOSFET | Gate (via 100–220 Ω) | **GPIO26** | 10 kΩ gate→source, flyback diode across the fan, common GND with 12 V |

- **Common ground:** ESP32 GND, sensor GND and the 12 V supply's GND must be connected.
- **Fan supply:** never power the fan from the ESP32. 12 V goes through the relay contacts or the MOSFET only.
- **GPIO34** is input-only and on ADC1, so it keeps working while Wi-Fi is on (ADC2 pins don't).
- **On-board LED (GPIO2):**
  - fast blink = setup portal open
  - slow blink = no Wi-Fi
  - double blink = Wi-Fi OK but no MQTT
  - steady = online

### Relay vs MOSFET (fan output)

The fan output level is a **setting**: `1` = active-LOW (most relay modules, LOW = fan ON), `0` = active-HIGH (MOSFET, HIGH = fan ON). The default comes from `-DFAN_ACTIVE_LOW_DEFAULT=1` in `platformio.ini`. You can change it later without reflashing, in the setup portal or with the serial command `active-low 0|1`. The output is always **OFF at boot**.

**Fan logic:**
- **Auto:** ON at ≥ `fanOnTemp` (default 32 °C), OFF at ≤ `fanOffTemp` (28 °C). At most one switch per 10 s, to spare the relay.
- **On / Off:** manual override from the app or console. The mode is saved in NVS and restored after a reboot; the output is OFF until the first loop applies it.
- **Fail-safe:** in Auto, with **no valid air temperature for 60 s** (DHT22 unplugged or broken), the fan turns **ON** and stays on until a valid reading returns. Then Auto decides afresh. The log shows `FAIL-SAFE`, and the telemetry shows `fanOn: true` with `airTemp: null`, `errors: ["dht"]`.

**5 V relay modules driven from a 3.3 V GPIO often never release.** Test before connecting the fan:

1. Fan disconnected; multimeter in continuity mode on the relay's COM–NO.
2. Boot the board. The relay must be **released** (LED off, COM–NO open).
3. In the serial monitor: `fan on` → click, closed. `fan off` → click, open. Repeat 10×.
4. If it stays on, or the LED glows faintly while "off", the module isn't compatible as wired. Options:
   - Remove the **JD-VCC** jumper. Then JD-VCC → 5 V and VCC → **3.3 V**.
   - Or add an NPN transistor / 74HCT125 between GPIO26 and IN.
   - Or use a logic-level MOSFET (IRLZ44N / AO3400 / D4184 module, **not** IRF520), wired as in the table above, and set `active-low 0`.

## Install PlatformIO and flash

1. **VS Code extension:** VS Code → Extensions → install **PlatformIO IDE**. It installs everything else (Python and the toolchain) itself; first start takes a few minutes.
2. **Open the project:** File → Open Folder → `smart-greenhouse/firmware`. PlatformIO detects `platformio.ini`, and the first build downloads the ESP32 platform and the pinned libraries.
3. **USB driver:** connect the ESP32 with a **data** USB cable (some cables are charge-only). If Windows shows no new COM port (Device Manager → Ports), install the driver for the USB chip on your board: **CP210x** (Silicon Labs) or **CH340** (WCH).
4. **Build, flash, watch:** use the PlatformIO toolbar at the bottom: ✓ Build, → Upload, 🔌 Serial Monitor. Or the PlatformIO terminal (the PlatformIO icon in the sidebar → Miscellaneous → *New Terminal*), where the `pio` command works:

```powershell
cd C:\Users\RIO\Desktop\smart-greenhouse\firmware
pio run                    # compile only (checks the code)
pio run -t upload          # compile and flash to the board on USB
pio device monitor         # serial log at 115200 baud; Ctrl+C to quit
```

- `pio run -t upload` finds the COM port automatically. If there are several ports, add `--upload-port COM5`.
- If the upload stalls at `Connecting....`, hold **BOOT** until the percentage starts. Some boards need it.
- Close the serial monitor before uploading: only one program can use the COM port.
- `platformio.ini` pins `upload_port`/`monitor_port` to **COM10** because this laptop also has Bluetooth COM ports. Change it if your board shows up on another port.
- Flashing keeps the NVS data: Wi-Fi, broker, device id, thresholds, fan mode and calibration survive a reflash.

## Bring-up tests

Small sketches that test **one part at a time**, without Wi-Fi or MQTT. Each builds in its own PlatformIO environment. Flash one, read its output, then flash the main firmware again with `pio run -t upload`.

```powershell
pio run -e test_dht -t upload -t monitor      # DHT22: T/RH every 2.5 s, or FAIL (NaN) with hints
pio run -e test_soil -t upload -t monitor     # soil: averaged mV every second + OK/TOO HIGH/NOISY
pio run -e test_bh1750 -t upload -t monitor   # BH1750: I2C scan until found, then lux every second
pio run -e test_fan -t upload -t monitor      # fan output: type 1 / 0 / t (toggle 5 s) / p (polarity)
```

`-e` picks the environment, `-t upload` flashes it, and `-t monitor` opens the serial monitor afterwards (Ctrl+C to quit). The main firmware's serial console (`status`, `watch`, `fan on`) covers the same checks once everything is wired.

## First start: Wi-Fi + broker (setup portal)

With no Wi-Fi saved, the board opens a **setup portal** by itself. The fan logic keeps running meanwhile.

**The one rule:** the ESP32, the laptop and the phone must be on the **same router**. The ESP32 needs that router's **2.4 GHz** network (it can't see 5 GHz); the laptop and phone may use either band of the same router.

1. **Join the board's network:** on your phone, join Wi-Fi **`Greenhouse-Setup-XXXX`** (XXXX = end of the board's MAC, e.g. `6BD4`), password **`greenhouse`**. If Android warns "no internet", stay connected. If the setup page doesn't pop up, open <http://192.168.4.1>.
2. **Broker settings first:** tap **Setup** and set:
   - **MQTT broker host**: the laptop's LAN IP, e.g. `192.168.50.69` (`ipconfig` → Wireless LAN adapter Wi-Fi → IPv4 Address)
   - **MQTT port**: `1883`
   - **Device ID**: `gh-01`. Use another id if the simulator still runs as gh-01, or stop the simulator.
   - **Fan output**: `1` relay / `0` MOSFET

   Then **Save** and go back to the menu.
3. **Wi-Fi:** tap **Configure WiFi**, pick your **2.4 GHz** network, enter its password and **Save**. The portal closes and the board joins your network.
4. **Laptop network profile:** Windows must treat this Wi-Fi as **Private**, or its firewall blocks MQTT. Settings → Network & internet → Wi-Fi → (network) → Network profile type → Private. Or, in an Administrator PowerShell: `Set-NetConnectionProfile -Name "<network name>" -NetworkCategory Private`.
5. **Check it connected:** the serial log shows `[wifi] connected …` and `[mqtt] connected; subscribed to greenhouse/gh-01/command`. The LED turns steady.

**Changing Wi-Fi or laptop IP later:** hold the **BOOT** button for **3 s** while the board runs (not during reset: BOOT + reset enters flash mode). The LED blinks fast and the portal opens: **Configure WiFi** replaces the saved network, **Setup** changes the broker host. Or use the serial commands `portal` / `mqtt 192.168.1.50`. No reflash needed. The portal closes by itself after 5 min. If the saved Wi-Fi is gone, the board keeps retrying it; it does **not** reopen the portal by itself, so use BOOT.

A new network almost always means a **new laptop IP**: update it on the board (above) **and** in the app (Settings → Server → Backend address). Reserve the laptop's IP in the router (DHCP reservation) so this doesn't happen after every reboot.

## Serial console

Type in the serial monitor (115200 baud, press Enter):

| Command | What it does |
|---|---|
| `help` | List commands |
| `status` | Settings, Wi-Fi/MQTT state, sensor values, free memory |
| `watch` | Toggle raw sensor values every second |
| `fan auto` / `fan on` / `fan off` | Fan mode (same as the app) |
| `thr 32 28` | Fan ON/OFF temperatures (saved in NVS) |
| `cal dry` / `cal wet` | Capture the soil calibration point now |
| `cal 2600 1200` | Set dry/wet mV directly |
| `active-low 1` / `active-low 0` | Relay (active-LOW) / MOSFET (active-HIGH) |
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

- Every **5 s**, telemetry as in the contract (`airTemp`, `humidity`, `soilMoisture`, `soilRaw` in mV, `lux`, `fanOn`, `fanMode`, `rssi`, `intervalSec`, `uptimeSec`, `fanOnTemp`, `fanOffTemp`, `soilDryMv`, `soilWetMv`, plus `ts` once NTP has synced).
- An extra message right after any command or fan switch, so the app confirms quickly.
- A failed sensor sends `null` plus `errors: ["dht"]` (or `bh1750`, `soil`, `soil_cal`). The others keep working.
- Retained `online` on connect. The Last Will `offline` (retained) is published by the broker if the board disappears.
- Commands older than 30 s are ignored (contract §4). Malformed JSON, unknown types and out-of-range values (thresholds outside 10–50 °C or ON − OFF < 1) are logged and ignored.

## Troubleshooting

| Symptom (serial log) | Likely cause / fix |
|---|---|
| Nothing in the monitor, or garbage | Wrong baud (must be 115200), or the monitor opened before boot: press **EN** (reset) |
| `[wifi] connecting…` repeats | Wrong Wi-Fi password, 5 GHz-only network (ESP32 needs 2.4 GHz), or weak signal (`status` shows RSSI; below about −80 dBm is unreliable: move the board or router closer). Hold BOOT 3 s → portal |
| `[mqtt] connect failed (state -2: broker unreachable …)`: check in this order | 1. **Same router?** The laptop must be on the board's network (`netsh wlan show interfaces` shows the laptop's SSID). 2. **Broker IP current?** `ipconfig` on the laptop vs `mqtt broker` in `status`; fix with `mqtt <ip>` or the portal. 3. **Mosquitto running?** `Get-Service mosquitto`. 4. **Firewall:** the laptop's Wi-Fi profile must be **Private** (`Get-NetConnectionProfile`), and ports 1883/4000 allowed (docs/setup-mosquitto.md) |
| `connect failed (state 5)` | Broker requires a login. Our Mosquitto config uses `allow_anonymous true` on the LAN listener |
| `ERROR DHT22 not answering` / NaN in `test_dht` | Sensor not plugged in or a jumper not fully seated; DATA ("out") not on the S pin of the GPIO27 row; "+" and "−" swapped; bare sensor without its 10 kΩ pull-up. Wait 2 s after power-up. Some modules want "+" on 5 V (data stays on GPIO27). In Auto, the fan goes fail-safe ON after 60 s |
| `ERROR BH1750 not found on I2C` | SDA/SCL swapped (21/22), no 3.3 V, or ADDR pulled high (0x5C). It retries every 10 s |
| `ERROR soil sensor reading implausible` | AOUT not on GPIO34 or loose (floating pin = noisy); powered from 5 V (> 3.1 V) |
| Soil % stuck at 0 or 100 | Calibration points swapped or not done: `cal dry` in air, `cal wet` in water |
| Fan never turns off, or relay always clicked (**relay never releases**) | Flash `test_fan` and measure: with the fan OFF, GPIO26 must be HIGH (3.3 V) for an active-LOW relay. If the relay still holds at 3.3 V, the 5 V module's input needs more than 3.3 V to release: see "Relay vs MOSFET". If it's the opposite state, the polarity is wrong: `active-low 0/1` |
| Fan ON although it's cool, mode auto | `status` says `FAIL-SAFE`: no valid air temperature for 60 s. Fix the DHT22; the fan returns to normal by itself |
| Fan doesn't react in auto | In auto it switches at most every 10 s. Check the thresholds with `status`. A mode set to `on`/`off` is remembered across reboots: `fan auto` |
| App shows the device offline but the log says online | Different device id than the app/simulator, or two boards with the same id |
| Upload fails: `Failed to connect` | Hold BOOT during "Connecting…", use a data cable, or close the serial monitor |
