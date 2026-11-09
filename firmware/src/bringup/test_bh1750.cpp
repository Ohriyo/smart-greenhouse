// Bring-up test: BH1750 light sensor only.   pio run -e test_bh1750 -t upload -t monitor
// Scans the I2C bus every 5 s until the sensor answers, then prints lux every second.
// Wiring: VCC → 3.3 V, GND → GND, SDA → GPIO21, SCL → GPIO22, ADDR → GND or unconnected (0x23).

#include <Arduino.h>
#include <BH1750.h>
#include <Wire.h>

#include "config.h"

BH1750 light(cfg::BH1750_ADDR);
bool ready = false;
uint32_t nextAction = 0;

void scan() {
  Serial.print("I2C scan:");
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf(" 0x%02X", addr);
      found++;
    }
  }
  if (found == 0) Serial.print(" nothing → check SDA=21, SCL=22, 3.3 V, GND");
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("\n=== BH1750 test (SDA %u, SCL %u, expected address 0x%02X; 0x5C if ADDR is high) ===\n",
                cfg::PIN_SDA, cfg::PIN_SCL, cfg::BH1750_ADDR);
  Wire.begin(cfg::PIN_SDA, cfg::PIN_SCL);
  Wire.setTimeOut(50);
}

void loop() {
  uint32_t now = millis();
  if (static_cast<int32_t>(now - nextAction) < 0) return;
  if (!ready) {
    nextAction = now + 5000;
    scan();
    Wire.beginTransmission(cfg::BH1750_ADDR);
    if (Wire.endTransmission() == 0 && light.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, cfg::BH1750_ADDR, &Wire)) {
      ready = true;
      Serial.println("BH1750 ready (continuous high-res mode). Cover it with your hand: lux should drop.");
    }
    return;
  }
  nextAction = now + 1000;
  float lux = light.readLightLevel();
  if (lux < 0) {
    Serial.println("read failed (I2C error), rescanning");
    ready = false;
  } else {
    Serial.printf("[%6lu ms] %.1f lx\n", (unsigned long)now, lux);
  }
}
