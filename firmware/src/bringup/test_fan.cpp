// Bring-up test: fan output (relay or MOSFET) only.   pio run -e test_fan -t upload -t monitor
// Starts OFF. Type in the serial monitor:
//   1 = fan ON, 0 = fan OFF, t = toggle every 5 s (on/off), p = flip polarity (active-LOW/HIGH)
// For each state it prints the GPIO26 level, so you can check the relay with a multimeter.
// A 5 V relay module that stays ON even with GPIO26 HIGH "never releases": see docs/firmware.md.

#include <Arduino.h>

#include "config.h"

bool activeLow = cfg::DEFAULT_FAN_ACTIVE_LOW;
bool on = false;
bool toggling = false;
uint32_t nextToggle = 0;

uint8_t level(bool fanOn) { return (fanOn != activeLow) ? HIGH : LOW; }

void apply(const char* why) {
  digitalWrite(cfg::PIN_FAN, level(on));
  Serial.printf("[%6lu ms] fan %s (%s) → GPIO%u %s [%s]\n", (unsigned long)millis(), on ? "ON " : "OFF",
                why, cfg::PIN_FAN, level(on) ? "HIGH (3.3 V)" : "LOW (0 V)",
                activeLow ? "active-LOW relay" : "active-HIGH MOSFET");
}

void setup() {
  Serial.begin(115200);
  delay(200);
  // OFF level first, then enable the output: no glitch at boot.
  digitalWrite(cfg::PIN_FAN, level(false));
  pinMode(cfg::PIN_FAN, OUTPUT);
  Serial.println("\n=== Fan output test: 1 = ON, 0 = OFF, t = toggle every 5 s, p = flip polarity ===");
  apply("boot");
}

void loop() {
  uint32_t now = millis();
  while (Serial.available()) {
    char ch = static_cast<char>(Serial.read());
    if (ch == '1') {
      toggling = false;
      on = true;
      apply("manual");
    } else if (ch == '0') {
      toggling = false;
      on = false;
      apply("manual");
    } else if (ch == 't') {
      toggling = !toggling;
      nextToggle = now;
      Serial.printf("toggle every 5 s: %s\n", toggling ? "on" : "off");
    } else if (ch == 'p') {
      activeLow = !activeLow;
      apply("polarity flipped");
    }
  }
  if (toggling && static_cast<int32_t>(now - nextToggle) >= 0) {
    nextToggle = now + 5000;
    on = !on;
    apply("toggle");
  }
}
