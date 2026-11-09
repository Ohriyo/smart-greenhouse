#pragma once
// Fan output with hysteresis. Runs in the control loop, independent of Wi-Fi/MQTT:
// in Auto the fan turns ON at >= fanOnTemp and OFF at <= fanOffTemp.
// Fail-safe: in Auto, with no valid air temperature for 60 s, the fan turns ON
// (better a running fan than a cooking greenhouse) until a valid reading returns.
// The output is always OFF at boot.

#include <Arduino.h>

#include "shared.h"

namespace fan {

void begin(bool activeLow);       // drives the OFF level before enabling the output
void setActiveLow(bool activeLow);  // re-drives the pin with the new polarity
void setMode(FanMode mode);
FanMode mode();
bool isOn();
bool failSafe();  // true while the Auto fail-safe holds the fan ON

/**
 * Applies the mode / hysteresis / fail-safe. Returns true when the output changed.
 * Without a valid temperature, Auto keeps the current state until the fail-safe
 * timeout, then turns the fan ON.
 */
bool update(uint32_t now, bool tempOk, float temp, float onTemp, float offTemp);

}  // namespace fan
