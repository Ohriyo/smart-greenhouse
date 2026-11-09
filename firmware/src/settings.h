#pragma once
// Settings stored in NVS (flash), so changing them needs no reflash.
// get()/networkVersion() are safe from any task; the setters write flash and
// are only called from the control loop (the network task posts a Command).

#include <Arduino.h>

#include "shared.h"  // FanMode

struct Settings {
  char deviceId[33];
  char mqttHost[65];
  uint16_t mqttPort;
  float fanOnTemp;
  float fanOffTemp;
  uint16_t soilDryMv;  // sensor output in air (0 %)
  uint16_t soilWetMv;  // sensor output in water (100 %)
  bool fanActiveLow;   // true: relay module (LOW = on); false: MOSFET (HIGH = on)
  FanMode fanMode;     // last mode set from the app/console; restored after a reboot
};

namespace settings {

void begin();      // load from NVS, falling back to defaults for missing/invalid values
Settings get();    // copy of the current settings
void print();      // log all settings

// Network settings; bump networkVersion() so the network task reconnects.
bool setNetwork(const char* host, uint16_t port, const char* deviceId);
uint32_t networkVersion();

bool setFanThresholds(float onTemp, float offTemp);  // validates (10–50 °C, on − off ≥ 1)
void setSoilDry(uint16_t mv);
void setSoilWet(uint16_t mv);
bool setSoilCalibration(uint16_t dryMv, uint16_t wetMv);
void setFanActiveLow(bool activeLow);
void setFanMode(FanMode mode);
void factoryReset();  // erase our NVS namespace (Wi-Fi credentials are separate)

bool isValidDeviceId(const char* id);
bool isValidFanThresholds(float onTemp, float offTemp);

}  // namespace settings
