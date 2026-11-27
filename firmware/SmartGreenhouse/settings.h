#pragma once
// Settings stored in NVS (flash), so changing them needs no reflash.
// get() is safe from any task; the setters write flash and are only called
// from the control loop (console and backend commands run there).
// Wi-Fi, server URL and device key are compile-time values in secrets.h.

#include <Arduino.h>

struct Settings {
  char deviceId[33];
  uint16_t soilDryMv;  // sensor output in air (0 %)
  uint16_t soilWetMv;  // sensor output in water (100 %)
};

namespace settings {

void begin();      // load from NVS, falling back to defaults for missing/invalid values
Settings get();    // copy of the current settings
void print();      // log all settings

bool setDeviceId(const char* id);  // used from the next reading on
void setSoilDry(uint16_t mv);
void setSoilWet(uint16_t mv);
bool setSoilCalibration(uint16_t dryMv, uint16_t wetMv);
void factoryReset();  // erase our NVS namespace

bool isValidDeviceId(const char* id);

}  // namespace settings
