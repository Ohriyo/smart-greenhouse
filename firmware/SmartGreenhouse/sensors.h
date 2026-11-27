#pragma once
// DHT22 (air temp + humidity), BH1750 (light), capacitive soil moisture v1.2.
// update() is non-blocking: call it every loop; each sensor runs on its own timer.
// A failed sensor never stops the others: its value becomes "not ok" (null in
// telemetry) and its error flag is set. There is NO soil temperature sensor.

#include <Arduino.h>

namespace sensors {

struct Readings {
  bool airOk;  // airTemp + humidity valid
  float airTemp;
  float humidity;
  bool luxOk;
  float lux;
  bool soilRawOk;  // averaged mV valid
  int soilMv;
  uint8_t errors;  // SensorError bits (ERR_DHT, ERR_BH1750, ERR_SOIL)
};

void begin();
void update(uint32_t now);
Readings get();

/** Soil moisture % from mV with the dry/wet calibration; false if calibration is invalid. */
bool soilPercent(int mv, uint16_t dryMv, uint16_t wetMv, float& out);

/** Prints the raw values once (serial "watch" command). */
void printRaw();

}  // namespace sensors
