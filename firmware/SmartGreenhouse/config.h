#pragma once
// Pins, timing and defaults. Values marked (NVS) are only defaults: the saved
// value in flash wins and can be changed from the serial console without
// reflashing. Wi-Fi, server URL and device key are in secrets.h.

#include <Arduino.h>

namespace cfg {

// ---------- Pins (ESP32 DevKit 30-pin) ----------
constexpr uint8_t PIN_DHT = 27;    // DHT22 data (10 kΩ pull-up to 3.3 V if the module has none)
constexpr uint8_t PIN_SDA = 21;    // BH1750 SDA
constexpr uint8_t PIN_SCL = 22;    // BH1750 SCL
constexpr uint8_t BH1750_ADDR = 0x23;  // ADDR pin low/floating
constexpr uint8_t PIN_SOIL = 34;   // capacitive soil sensor AOUT (input-only pin, ADC1)
constexpr uint8_t PIN_LED = 2;     // on-board blue LED

// ---------- Reading interval: the ONE place to change it ----------
// The backend marks the greenhouse offline after 3 missed intervals (+2 s).
constexpr uint32_t READING_INTERVAL_MS = 30000;  // POST /api/readings every 30 s

// ---------- Uplink (HTTPS) ----------
constexpr uint32_t HTTP_TIMEOUT_MS = 20000;        // connect / TLS handshake / answer, each
constexpr uint32_t RETRY_AFTER_FAILURE_MS = 10000; // a failed POST is retried sooner (cold start)
constexpr uint32_t WIFI_RETRY_MS = 15000;          // re-join Wi-Fi if auto-reconnect gave up
constexpr uint32_t MAX_COMMAND_AGE_S = 150;        // contract §4: ignore older commands

// ---------- Sensor timing ----------
constexpr uint32_t DHT_INTERVAL_MS = 2500;        // DHT22 needs >= 2 s between reads
constexpr uint8_t DHT_MAX_MISSES = 2;             // keep the last real value for this many failed reads
constexpr uint32_t LIGHT_INTERVAL_MS = 1000;      // BH1750 continuous high-res: ~120 ms/measurement
constexpr uint32_t LIGHT_RETRY_MS = 10000;        // retry BH1750 init if it was missing
constexpr uint32_t SOIL_SAMPLE_MS = 62;           // one ADC sample every 62 ms ...
constexpr uint8_t SOIL_SAMPLES = 16;              // ... averaged over 16 samples (~1 s)

// ---------- Soil sensor sanity limits (mV at the ADC pin) ----------
constexpr int SOIL_MIN_VALID_MV = 50;     // below: shorted / not powered
constexpr int SOIL_MAX_VALID_MV = 3100;   // above: floating pin or sensor powered from 5 V
constexpr int SOIL_MAX_SPREAD_MV = 400;   // min–max within 1 s: a floating pin is noisy
constexpr int SOIL_MIN_CAL_SPAN_MV = 200; // dry must be this much higher than wet

// ---------- Defaults (NVS) ----------
constexpr const char* DEFAULT_DEVICE_ID = "gh-01";
constexpr uint16_t DEFAULT_SOIL_DRY_MV = 2600;  // typical v1.2 in air at 3.3 V supply
constexpr uint16_t DEFAULT_SOIL_WET_MV = 1200;  // typical v1.2 in water

}  // namespace cfg
