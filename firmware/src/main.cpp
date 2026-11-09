// Smart Greenhouse ESP32 firmware.
//
// loop() (core 1) = control: sensors, fan hysteresis, BOOT button, LED, serial
// console, commands. It never waits for the network, so ventilation keeps
// working without Wi-Fi or MQTT.
// network task (core 0) = Wi-Fi, MQTT, NTP, setup portal (src/network.cpp).
// Every job in loop() runs on its own millis() timer; nothing in it waits.
//
// Contract: docs/api-contract.md §4. Bring-up: docs/firmware.md.

#include <Arduino.h>

#include "commands.h"
#include "config.h"
#include "console.h"
#include "fan.h"
#include "log.h"
#include "network.h"
#include "sensors.h"
#include "settings.h"
#include "shared.h"

namespace {

// ---------- BOOT button: hold 3 s → setup portal ----------

uint32_t pressedSince = 0;
bool longPressFired = false;

void updateButton(uint32_t now) {
  bool pressed = digitalRead(cfg::PIN_BOOT) == LOW;
  if (!pressed) {
    pressedSince = 0;
    longPressFired = false;
    return;
  }
  if (pressedSince == 0) pressedSince = now;
  if (!longPressFired && now - pressedSince >= cfg::BOOT_LONG_PRESS_MS) {
    longPressFired = true;
    LOGF("button", "BOOT held 3 s → opening setup portal");
    shared::requestPortal();
  }
}

// ---------- Status LED: fast blink = portal, slow = no Wi-Fi, double = no MQTT, on = online ----------

void updateLed(uint32_t now) {
  bool on = false;
  switch (net::state()) {
    case net::State::Portal:
      on = (now / 150) % 2;
      break;
    case net::State::NoWifi:
      on = (now / 1000) % 2;
      break;
    case net::State::NoMqtt:
      on = (now % 1500) < 100 || ((now % 1500) > 250 && (now % 1500) < 350);
      break;
    case net::State::Online:
      on = true;
      break;
  }
  digitalWrite(cfg::PIN_LED, on ? HIGH : LOW);
}

// ---------- Snapshot for the network task ----------

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
  snap.fanOn = fan::isOn();
  snap.fanMode = fan::mode();
  shared::setSnapshot(snap);
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println(F("\n\n=== Smart Greenhouse firmware ==="));
  LOGF("boot", "chip %s rev %d, %lu MHz, flash %lu KB", ESP.getChipModel(), ESP.getChipRevision(),
       (unsigned long)ESP.getCpuFreqMHz(), (unsigned long)(ESP.getFlashChipSize() / 1024));

  settings::begin();
  // Fan first: the output must be OFF before anything else can take time.
  fan::begin(settings::get().fanActiveLow);
  // The output stays OFF here; the saved mode takes effect in the first loop()
  // (Auto still needs a valid temperature before it can switch ON).
  fan::setMode(settings::get().fanMode);
  settings::print();

  pinMode(cfg::PIN_BOOT, INPUT_PULLUP);
  pinMode(cfg::PIN_LED, OUTPUT);

  shared::begin();
  sensors::begin();
  net::begin();
  console::begin();
}

void loop() {
  uint32_t now = millis();
  sensors::update(now);

  Command c;
  while (shared::takeCommand(c)) commands::apply(c);

  sensors::Readings r = sensors::get();
  Settings s = settings::get();
  if (fan::update(now, r.airOk, r.airTemp, s.fanOnTemp, s.fanOffTemp)) shared::requestTelemetry();

  publishSnapshot();
  updateButton(now);
  updateLed(now);
  console::update(now);
  // Not a wait: hand the CPU to other tasks for one RTOS tick (1 ms) so core 1
  // doesn't spin at 100 %. All timing above is millis()-based.
  vTaskDelay(1);
}
