// Smart Greenhouse ESP32 firmware.
//
// loop() (core 1) = control: sensors, LED, serial console, commands. It never
// waits for the network, so the sensors keep being read without Wi-Fi or server.
// uplink task (core 0) = Wi-Fi, NTP and the HTTPS POST of each reading (uplink.cpp).
// Every job in loop() runs on its own millis() timer; nothing in it waits.
//
// Contract: docs/api-contract.md §2 (POST /api/readings) and §4. Guide: docs/firmware.md.

#include <Arduino.h>

#include "commands.h"
#include "config.h"
#include "console.h"
#include "log.h"
#include "sensors.h"
#include "settings.h"
#include "shared.h"
#include "uplink.h"

namespace {

// ---------- Status LED: slow blink = no Wi-Fi, double blink = server not reached, on = online ----------

void updateLed(uint32_t now) {
  bool on = false;
  switch (uplink::state()) {
    case uplink::State::NoWifi:
      on = (now / 1000) % 2;
      break;
    case uplink::State::NoServer:
      on = (now % 1500) < 100 || ((now % 1500) > 250 && (now % 1500) < 350);
      break;
    case uplink::State::Online:
      on = true;
      break;
  }
  digitalWrite(cfg::PIN_LED, on ? HIGH : LOW);
}

// ---------- Snapshot for the uplink task ----------

void publishSnapshot() {
  sensors::Readings r = sensors::get();
  Settings s = settings::get();
  Snapshot snap;
  snap.airOk = r.airOk;
  snap.airTemp = r.airTemp;
  snap.humidity = r.humidity;
  snap.luxOk = r.luxOk;
  snap.lux = r.lux;
  snap.soilRawOk = r.soilRawOk;
  snap.soilMv = r.soilMv;
  snap.errors = r.errors;
  if (r.soilRawOk) {
    snap.soilPctOk = sensors::soilPercent(r.soilMv, s.soilDryMv, s.soilWetMv, snap.soilPct);
    if (!snap.soilPctOk) snap.errors |= ERR_SOIL_CAL;
  }
  shared::setSnapshot(snap);
}

}  // namespace

void setup() {
  Serial.begin(115200);
  settings::begin();

  delay(200);
  Serial.println(F("\n\n=== Smart Greenhouse firmware ==="));
  LOGF("boot", "chip %s rev %d, %lu MHz, flash %lu KB", ESP.getChipModel(), ESP.getChipRevision(),
       (unsigned long)ESP.getCpuFreqMHz(), (unsigned long)(ESP.getFlashChipSize() / 1024));
  settings::print();

  pinMode(cfg::PIN_LED, OUTPUT);

  shared::begin();
  sensors::begin();
  uplink::begin();
  console::begin();
}

void loop() {
  uint32_t now = millis();
  sensors::update(now);

  Command c;
  while (shared::takeCommand(c)) commands::apply(c);

  publishSnapshot();
  updateLed(now);
  console::update(now);
  // Not a wait: hand the CPU to other tasks for one RTOS tick (1 ms) so core 1
  // doesn't spin at 100 %. All timing above is millis()-based.
  vTaskDelay(1);
}
