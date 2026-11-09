#include "fan.h"

#include "config.h"
#include "log.h"

namespace fan {
namespace {
bool activeLow = true;
bool on = false;
FanMode currentMode = FanMode::Auto;
uint32_t lastSwitch = 0;
bool switchedOnce = false;
bool warnedNoTemp = false;
uint32_t lastValidTemp = 0;  // millis() of the last valid reading (boot counts as one)
bool inFailSafe = false;

// on XOR activeLow: relay (active-LOW) ON = LOW, MOSFET (active-HIGH) ON = HIGH.
uint8_t level(bool fanOn) { return (fanOn != activeLow) ? HIGH : LOW; }
void write() { digitalWrite(cfg::PIN_FAN, level(on)); }
}  // namespace

void begin(bool lowActive) {
  activeLow = lowActive;
  on = false;
  // Set the OFF level first, then enable the output: no glitch that could click the relay.
  digitalWrite(cfg::PIN_FAN, level(false));
  pinMode(cfg::PIN_FAN, OUTPUT);
  write();
  lastValidTemp = millis();
  LOGF("fan", "output GPIO%u %s, fan OFF at boot (pin %s)", cfg::PIN_FAN,
       activeLow ? "active-LOW (relay)" : "active-HIGH (MOSFET)", level(false) ? "HIGH" : "LOW");
}

void setActiveLow(bool lowActive) {
  activeLow = lowActive;
  write();
  LOGF("fan", "output polarity now %s; fan %s (pin %s)",
       activeLow ? "active-LOW" : "active-HIGH", on ? "ON" : "OFF", level(on) ? "HIGH" : "LOW");
}

void setMode(FanMode m) {
  if (m == currentMode) return;
  currentMode = m;
  LOGF("fan", "mode -> %s", fanModeName(m));
}

FanMode mode() { return currentMode; }
bool isOn() { return on; }
bool failSafe() { return inFailSafe; }

bool update(uint32_t now, bool tempOk, float temp, float onTemp, float offTemp) {
  bool want = on;
  bool endFailSafe = false;
  if (tempOk) lastValidTemp = now;  // tracked in every mode, so switching to Auto is fair
  switch (currentMode) {
    case FanMode::On:
      want = true;
      break;
    case FanMode::Off:
      want = false;
      break;
    case FanMode::Auto:
      if (!tempOk) {
        if (now - lastValidTemp >= cfg::FAN_FAILSAFE_MS) {
          if (!inFailSafe) {
            inFailSafe = true;
            LOGF("fan", "FAIL-SAFE: no valid air temperature for %lu s → fan ON until the sensor is back",
                 (unsigned long)(cfg::FAN_FAILSAFE_MS / 1000));
          }
          want = true;
          break;
        }
        if (!warnedNoTemp) {
          LOGF("fan", "auto: no valid air temperature, keeping fan %s (fail-safe ON after %lu s)",
               on ? "ON" : "OFF", (unsigned long)(cfg::FAN_FAILSAFE_MS / 1000));
        }
        warnedNoTemp = true;
        return false;
      }
      warnedNoTemp = false;
      if (inFailSafe) {
        // Back from blind mode: decide from scratch, not from the forced ON state.
        endFailSafe = true;
        want = temp >= onTemp;
      } else if (temp >= onTemp) {
        want = true;
      } else if (temp <= offTemp) {
        want = false;
      }
      break;
  }
  if (currentMode != FanMode::Auto && inFailSafe) {
    inFailSafe = false;  // manual mode overrides the fail-safe
    LOGF("fan", "fail-safe cleared by manual mode %s", fanModeName(currentMode));
  }
  auto leaveFailSafe = [&]() {
    if (!endFailSafe) return;
    inFailSafe = false;
    LOGF("fan", "fail-safe ended: air temperature valid again (%.1f °C)", temp);
  };
  if (want == on) {
    leaveFailSafe();
    return false;
  }
  // Auto only: at most one switch per FAN_MIN_SWITCH_MS (relay life, noisy sensor).
  // A blocked switch is retried on the next loop (fail-safe exit included).
  if (currentMode == FanMode::Auto && switchedOnce && now - lastSwitch < cfg::FAN_MIN_SWITCH_MS) {
    return false;
  }
  leaveFailSafe();
  on = want;
  lastSwitch = now;
  switchedOnce = true;
  write();
  if (currentMode == FanMode::Auto && inFailSafe) {
    LOGF("fan", "ON (auto fail-safe: no valid air temperature)");
  } else if (currentMode == FanMode::Auto) {
    LOGF("fan", "%s (auto: %.1f °C, on >= %.1f, off <= %.1f)", on ? "ON" : "OFF", temp, onTemp, offTemp);
  } else {
    LOGF("fan", "%s (forced %s)", on ? "ON" : "OFF", fanModeName(currentMode));
  }
  return true;
}

}  // namespace fan
