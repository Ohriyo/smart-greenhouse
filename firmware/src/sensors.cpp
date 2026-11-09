#include "sensors.h"

#include <BH1750.h>
#include <DHT.h>
#include <Wire.h>

#include "config.h"
#include "log.h"
#include "shared.h"

namespace sensors {
namespace {

DHT dht(cfg::PIN_DHT, DHT22);
BH1750 light(cfg::BH1750_ADDR);

Readings r{};

// DHT22
uint32_t nextDht = 0;
uint8_t dhtMisses = 0;

// BH1750
bool lightReady = false;
uint32_t nextLight = 0;
uint32_t nextLightInit = 0;

// Soil: ring buffer of mV samples, averaged once full.
int soilBuf[cfg::SOIL_SAMPLES];
uint8_t soilCount = 0;
uint8_t soilIdx = 0;
uint32_t nextSoil = 0;
int lastSpread = 0;

void setError(uint8_t bit, bool on, const char* what) {
  bool was = r.errors & bit;
  if (on == was) return;
  if (on) {
    r.errors |= bit;
    LOGF("sensor", "ERROR %s", what);
  } else {
    r.errors &= ~bit;
    LOGF("sensor", "recovered: %s", what);
  }
}

void initLight() {
  // Probe quietly first: the BH1750 library prints an error on every failed begin().
  Wire.beginTransmission(cfg::BH1750_ADDR);
  bool present = Wire.endTransmission() == 0;
  lightReady = present && light.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, cfg::BH1750_ADDR, &Wire);
  if (lightReady) LOGF("sensor", "BH1750 found at 0x%02X (continuous high-res mode)", cfg::BH1750_ADDR);
  setError(ERR_BH1750, !lightReady, "BH1750 not found on I2C (check SDA=21, SCL=22, 3.3 V, ADDR)");
}

void readDht(uint32_t now) {
  if ((int32_t)(now - nextDht) < 0) return;
  nextDht = now + cfg::DHT_INTERVAL_MS;
  float t = dht.readTemperature(false, true);  // force a new reading
  float h = dht.readHumidity();                // same reading (cached by the library)
  if (isnan(t) || isnan(h) || t < -40 || t > 80 || h < 0 || h > 100) {
    // One bad read happens; keep the last value for a couple of reads before reporting null.
    if (dhtMisses < 255) dhtMisses++;
    if (dhtMisses > cfg::DHT_MAX_MISSES) {
      r.airOk = false;
      setError(ERR_DHT, true, "DHT22 not answering (check GPIO27, 3.3 V, pull-up)");
    }
    return;
  }
  dhtMisses = 0;
  r.airOk = true;
  r.airTemp = t;
  r.humidity = h;
  setError(ERR_DHT, false, "DHT22");
}

void readLight(uint32_t now) {
  if (!lightReady) {
    if ((int32_t)(now - nextLightInit) >= 0) {
      nextLightInit = now + cfg::LIGHT_RETRY_MS;
      initLight();  // hot-plug: keep trying
    }
    r.luxOk = false;
    return;
  }
  if ((int32_t)(now - nextLight) < 0) return;
  nextLight = now + cfg::LIGHT_INTERVAL_MS;
  float lux = light.readLightLevel();  // negative = I2C error / not configured
  if (lux < 0) {
    r.luxOk = false;
    lightReady = false;  // re-init on the next retry
    nextLightInit = now + cfg::LIGHT_RETRY_MS;
    setError(ERR_BH1750, true, "BH1750 read failed (I2C)");
    return;
  }
  r.luxOk = true;
  r.lux = lux;
  setError(ERR_BH1750, false, "BH1750");
}

void readSoil(uint32_t now) {
  if ((int32_t)(now - nextSoil) < 0) return;
  nextSoil = now + cfg::SOIL_SAMPLE_MS;
  soilBuf[soilIdx] = analogReadMilliVolts(cfg::PIN_SOIL);  // calibrated by the ESP32's eFuse data
  soilIdx = (soilIdx + 1) % cfg::SOIL_SAMPLES;
  if (soilCount < cfg::SOIL_SAMPLES) soilCount++;
  if (soilCount < cfg::SOIL_SAMPLES) return;  // first full second after boot

  long sum = 0;
  int lo = INT32_MAX, hi = INT32_MIN;
  for (int v : soilBuf) {
    sum += v;
    lo = min(lo, v);
    hi = max(hi, v);
  }
  int avg = static_cast<int>(sum / cfg::SOIL_SAMPLES);
  lastSpread = hi - lo;
  bool plausible = avg >= cfg::SOIL_MIN_VALID_MV && avg <= cfg::SOIL_MAX_VALID_MV &&
                   lastSpread <= cfg::SOIL_MAX_SPREAD_MV;
  r.soilMv = avg;
  r.soilRawOk = plausible;
  setError(ERR_SOIL, !plausible,
           "soil sensor reading implausible (unplugged, floating, or powered from 5 V?)");
}

}  // namespace

void begin() {
  dht.begin();
  nextDht = millis() + 2000;  // DHT22 needs ~1–2 s after power-up

  Wire.begin(cfg::PIN_SDA, cfg::PIN_SCL);
  Wire.setTimeOut(50);  // a stuck I2C bus must not stall the loop
  initLight();
  nextLightInit = millis() + cfg::LIGHT_RETRY_MS;

  pinMode(cfg::PIN_SOIL, INPUT);
  analogReadResolution(12);
  LOGF("sensor", "DHT22 on GPIO%u, soil on GPIO%u (ADC1)", cfg::PIN_DHT, cfg::PIN_SOIL);
}

void update(uint32_t now) {
  readDht(now);
  readLight(now);
  readSoil(now);
}

Readings get() { return r; }

bool soilPercent(int mv, uint16_t dryMv, uint16_t wetMv, float& out) {
  // Capacitive sensors read *lower* voltage when wetter: dry > wet.
  if (dryMv <= wetMv || dryMv - wetMv < cfg::SOIL_MIN_CAL_SPAN_MV) return false;
  float pct = 100.0f * (static_cast<float>(dryMv) - mv) / (dryMv - wetMv);
  out = constrain(pct, 0.0f, 100.0f);
  return true;
}

void printRaw() {
  LOGF("raw", "DHT22  : %s T=%.1f °C RH=%.1f %%", r.airOk ? "ok " : "ERR", r.airTemp, r.humidity);
  LOGF("raw", "BH1750 : %s %.1f lx", r.luxOk ? "ok " : "ERR", r.lux);
  LOGF("raw", "soil   : %s %d mV (spread %d mV over 1 s)", r.soilRawOk ? "ok " : "ERR", r.soilMv,
       lastSpread);
}

}  // namespace sensors
