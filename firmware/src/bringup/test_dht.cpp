// Bring-up test: DHT22 only.   pio run -e test_dht -t upload -t monitor
// Prints temperature + humidity every 2.5 s, or why the read failed.
// Wiring: DHT22 "+" → 3.3 V, "out" → GPIO27, "−" → GND (bare sensor: 10 kΩ pull-up out→3.3 V).

#include <Arduino.h>
#include <DHT.h>

#include "config.h"

DHT dht(cfg::PIN_DHT, DHT22);
uint32_t nextRead = 2000;  // the sensor needs ~2 s after power-up
uint32_t ok = 0, failed = 0;

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("\n=== DHT22 test on GPIO%u (one read every %lu ms) ===\n", cfg::PIN_DHT,
                (unsigned long)cfg::DHT_INTERVAL_MS);
  dht.begin();
}

void loop() {
  uint32_t now = millis();
  if (static_cast<int32_t>(now - nextRead) < 0) return;
  nextRead = now + cfg::DHT_INTERVAL_MS;
  float t = dht.readTemperature(false, true);
  float h = dht.readHumidity();
  if (isnan(t) || isnan(h)) {
    failed++;
    Serial.printf("[%6lu ms] FAIL (NaN)   ok=%lu fail=%lu → check: data on GPIO%u, + on 3.3 V, − on GND, "
                  "connectors pushed fully on\n",
                  (unsigned long)now, (unsigned long)ok, (unsigned long)failed, cfg::PIN_DHT);
  } else {
    ok++;
    Serial.printf("[%6lu ms] OK  T=%5.1f °C  RH=%5.1f %%   ok=%lu fail=%lu\n", (unsigned long)now, t, h,
                  (unsigned long)ok, (unsigned long)failed);
  }
}
