#pragma once
// Pins, timing and defaults. Values marked (NVS) are only defaults: the saved
// value in flash wins and can be changed without reflashing.

#include <Arduino.h>

#ifndef FAN_ACTIVE_LOW_DEFAULT
#define FAN_ACTIVE_LOW_DEFAULT 1
#endif

namespace cfg {

// ---------- Pins (ESP32 DevKit 30-pin) ----------
constexpr uint8_t PIN_DHT = 27;    // DHT22 data (10 kΩ pull-up to 3.3 V if the module has none)
constexpr uint8_t PIN_SDA = 21;    // BH1750 SDA
constexpr uint8_t PIN_SCL = 22;    // BH1750 SCL
constexpr uint8_t BH1750_ADDR = 0x23;  // ADDR pin low/floating
constexpr uint8_t PIN_SOIL = 34;   // capacitive soil sensor AOUT (input-only pin, ADC1)
constexpr uint8_t PIN_FAN = 26;    // relay IN or MOSFET gate
constexpr uint8_t PIN_BOOT = 0;    // BOOT button (LOW when pressed)
constexpr uint8_t PIN_LED = 2;     // on-board blue LED

// ---------- Timing ----------
constexpr uint32_t TELEMETRY_INTERVAL_MS = 5000;  // contract: intervalSec = 5
constexpr uint32_t DHT_INTERVAL_MS = 2500;        // DHT22 needs >= 2 s between reads
constexpr uint8_t DHT_MAX_MISSES = 2;             // keep the last value for this many failed reads
constexpr uint32_t LIGHT_INTERVAL_MS = 1000;      // BH1750 continuous high-res: ~120 ms/measurement
constexpr uint32_t LIGHT_RETRY_MS = 10000;        // retry BH1750 init if it was missing
constexpr uint32_t SOIL_SAMPLE_MS = 62;           // one ADC sample every 62 ms ...
constexpr uint8_t SOIL_SAMPLES = 16;              // ... averaged over 16 samples (~1 s)
constexpr uint32_t FAN_MIN_SWITCH_MS = 10000;     // auto mode: protect the relay from chatter
constexpr uint32_t FAN_FAILSAFE_MS = 60000;       // auto: no valid air temp this long → fan ON
constexpr uint32_t BOOT_LONG_PRESS_MS = 3000;     // hold BOOT 3 s → setup portal
constexpr uint32_t PORTAL_TIMEOUT_S = 300;        // portal closes after 5 min unused
constexpr uint32_t MAX_COMMAND_AGE_S = 30;        // contract §4: ignore stale commands
constexpr uint32_t RECONNECT_INTERVAL_MS = 5000;  // Wi-Fi / MQTT: one attempt every 5 s
constexpr uint32_t WIFI_CONNECT_WINDOW_MS = 10000; // ... and a Wi-Fi attempt may take this long
constexpr uint16_t MQTT_BUFFER_SIZE = 512;        // telemetry is ~400 bytes, commands < 200

// ---------- Soil sensor sanity limits (mV at the ADC pin) ----------
constexpr int SOIL_MIN_VALID_MV = 50;     // below: shorted / not powered
constexpr int SOIL_MAX_VALID_MV = 3100;   // above: floating pin or sensor powered from 5 V
constexpr int SOIL_MAX_SPREAD_MV = 400;   // min–max within 1 s: a floating pin is noisy
constexpr int SOIL_MIN_CAL_SPAN_MV = 200; // dry must be this much higher than wet

// ---------- Defaults (NVS) ----------
constexpr const char* DEFAULT_DEVICE_ID = "gh-01";
constexpr const char* DEFAULT_MQTT_HOST = "192.168.50.69";  // the laptop's LAN IP
constexpr uint16_t DEFAULT_MQTT_PORT = 1883;
constexpr float DEFAULT_FAN_ON_TEMP = 32.0f;
constexpr float DEFAULT_FAN_OFF_TEMP = 28.0f;
constexpr uint16_t DEFAULT_SOIL_DRY_MV = 2600;  // typical v1.2 in air at 3.3 V supply
constexpr uint16_t DEFAULT_SOIL_WET_MV = 1200;  // typical v1.2 in water
constexpr bool DEFAULT_FAN_ACTIVE_LOW = FAN_ACTIVE_LOW_DEFAULT != 0;

// ---------- MQTT topics (contract §4); %s = device id ----------
constexpr const char* TOPIC_TELEMETRY = "greenhouse/%s/telemetry";  // up, every 5 s
constexpr const char* TOPIC_STATUS = "greenhouse/%s/status";        // up, retained, Last Will
constexpr const char* TOPIC_COMMAND = "greenhouse/%s/command";      // down

// ---------- Setup portal ----------
constexpr const char* PORTAL_AP_PREFIX = "Greenhouse-Setup";  // + "-XXXX" (end of the MAC)
constexpr const char* PORTAL_PASSWORD = "greenhouse";

}  // namespace cfg
