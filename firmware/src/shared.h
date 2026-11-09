#pragma once
// Everything the control loop (sensors + fan) and the network task share:
// - a snapshot of the latest values (control → network, for telemetry)
// - a command queue (network/console → control: MQTT commands, portal settings)
// - small request flags (publish telemetry now, open the setup portal)

#include <Arduino.h>

enum class FanMode : uint8_t { Auto, On, Off };
const char* fanModeName(FanMode mode);              // "auto" | "on" | "off" (contract FanMode)
bool parseFanMode(const char* text, FanMode& out);

// Sensor error flags, sent as telemetry "errors": ["dht", ...].
enum SensorError : uint8_t {
  ERR_DHT = 1 << 0,       // DHT22 not answering (airTemp + humidity null)
  ERR_BH1750 = 1 << 1,    // light sensor missing / I2C error (lux null)
  ERR_SOIL = 1 << 2,      // soil reading implausible: unplugged, floating, 5 V supply
  ERR_SOIL_CAL = 1 << 3,  // dry/wet calibration invalid (soilMoisture null, soilRaw sent)
};

struct Snapshot {
  bool airOk = false;
  float airTemp = 0;
  float humidity = 0;
  bool luxOk = false;
  float lux = 0;
  bool soilRawOk = false;  // soilMv valid
  int soilMv = 0;
  bool soilPctOk = false;  // soilPct valid (needs soilRawOk + calibration)
  float soilPct = 0;
  bool fanOn = false;
  FanMode fanMode = FanMode::Auto;
  uint8_t errors = 0;
};

enum class CmdType : uint8_t {
  SetFanMode,
  SetFanThresholds,
  CalibrateSoilDry,
  CalibrateSoilWet,
  SetNetwork,      // from the setup portal
  SetFanActiveLow, // from the setup portal
};

struct Command {
  CmdType type;
  FanMode mode = FanMode::Auto;
  float fanOnTemp = 0;
  float fanOffTemp = 0;
  bool activeLow = false;
  uint16_t port = 0;
  char host[65] = {0};
  char deviceId[33] = {0};
};

namespace shared {
void begin();
void setSnapshot(const Snapshot& s);
Snapshot snapshot();
bool postCommand(const Command& c);  // false if the queue is full
bool takeCommand(Command& c);         // non-blocking
void requestTelemetry();             // publish as soon as possible (after a change)
bool takeTelemetryRequest();
void requestPortal();
bool takePortalRequest();
}  // namespace shared
