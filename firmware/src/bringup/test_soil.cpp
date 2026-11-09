// Bring-up test: capacitive soil moisture v1.2 only.   pio run -e test_soil -t upload -t monitor
// Prints the averaged sensor output in mV once per second (16 samples, like the firmware).
// Wiring: VCC → 3.3 V (NOT 5 V), GND → GND, AOUT → GPIO34.
// Expect roughly 2400–2900 mV in air and 1000–1500 mV in water. Note both: they are your
// dry/wet calibration points (or use "cal dry" / "cal wet" in the main firmware).

#include <Arduino.h>

#include "config.h"

int samples[cfg::SOIL_SAMPLES];
uint8_t count = 0;
uint32_t nextSample = 0;

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("\n=== Soil sensor test on GPIO%u (ADC1), %u samples / %lu ms ===\n", cfg::PIN_SOIL,
                cfg::SOIL_SAMPLES, (unsigned long)cfg::SOIL_SAMPLE_MS);
  pinMode(cfg::PIN_SOIL, INPUT);
  analogReadResolution(12);
}

void loop() {
  uint32_t now = millis();
  if (static_cast<int32_t>(now - nextSample) < 0) return;
  nextSample = now + cfg::SOIL_SAMPLE_MS;
  samples[count++] = analogReadMilliVolts(cfg::PIN_SOIL);
  if (count < cfg::SOIL_SAMPLES) return;
  count = 0;

  long sum = 0;
  int lo = INT32_MAX, hi = INT32_MIN;
  for (int v : samples) {
    sum += v;
    lo = min(lo, v);
    hi = max(hi, v);
  }
  int avg = static_cast<int>(sum / cfg::SOIL_SAMPLES);
  const char* verdict = "OK";
  if (avg < cfg::SOIL_MIN_VALID_MV) verdict = "TOO LOW: not powered or AOUT shorted to GND?";
  else if (avg > cfg::SOIL_MAX_VALID_MV) verdict = "TOO HIGH: powered from 5 V or AOUT floating?";
  else if (hi - lo > cfg::SOIL_MAX_SPREAD_MV) verdict = "NOISY: AOUT probably not connected";
  Serial.printf("[%6lu ms] %4d mV (min %4d, max %4d)  %s\n", (unsigned long)now, avg, lo, hi, verdict);
}
