#pragma once
// Everything the control loop (sensors) and the uplink task share:
// - a snapshot of the latest values (control → uplink, for the next reading)
// - a command queue (uplink/console → control: commands from the backend)
// - a request flag (send a reading now, e.g. after a calibration change)

#include <Arduino.h>

// Sensor error flags, sent as "errors": ["dht", ...] in each reading.
enum SensorError : uint8_t {
  ERR_DHT = 1 << 0,       // DHT22 not answering (temperature + humidity null)
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
  uint8_t errors = 0;
};

enum class CmdType : uint8_t {
  CalibrateSoilDry,
  CalibrateSoilWet,
};

struct Command {
  CmdType type;
};

namespace shared {
void begin();
void setSnapshot(const Snapshot& s);
Snapshot snapshot();
bool postCommand(const Command& c);  // false if the queue is full
bool takeCommand(Command& c);         // non-blocking
void requestReading();               // send a reading as soon as possible (after a change)
bool takeReadingRequest();
}  // namespace shared
