#include "console.h"

#include <WiFi.h>

#include "fan.h"
#include "log.h"
#include "network.h"
#include "sensors.h"
#include "settings.h"
#include "shared.h"

namespace console {
namespace {

char line[96];
size_t len = 0;
bool watch = false;
uint32_t nextWatch = 0;

void help() {
  Serial.println(F(
      "\nCommands:\n"
      "  status                   settings, connection, sensor values\n"
      "  watch                    toggle raw sensor print every 1 s\n"
      "  fan auto|on|off          fan mode (same as the app)\n"
      "  thr <on> <off>           fan thresholds in °C, e.g. thr 32 28\n"
      "  cal dry                  soil sensor in AIR now: save as 0 %\n"
      "  cal wet                  soil sensor in WATER now: save as 100 %\n"
      "  cal <dryMv> <wetMv>      set calibration numbers directly\n"
      "  active-low 1|0           fan output: 1 = relay (active-LOW), 0 = MOSFET\n"
      "  mqtt <host> [port]       broker address (the laptop's LAN IP)\n"
      "  id <deviceId>            device id (topics greenhouse/<id>/...)\n"
      "  portal                   open the Wi-Fi setup portal (same as holding BOOT 3 s)\n"
      "  factory                  erase saved settings (not Wi-Fi), then reboot\n"
      "  reboot\n"));
}

void status() {
  settings::print();
  LOGF("status", "network: %s, Wi-Fi \"%s\" IP %s RSSI %d", net::stateName(net::state()),
       WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
  LOGF("status", "fan: %s, mode %s%s", fan::isOn() ? "ON" : "OFF", fanModeName(fan::mode()),
       fan::failSafe() ? " (FAIL-SAFE: no valid air temperature)" : "");
  sensors::printRaw();
  Snapshot s = shared::snapshot();
  if (s.soilPctOk) LOGF("status", "soil moisture: %.1f %%", s.soilPct);
  else LOGF("status", "soil moisture: n/a (raw invalid or calibration invalid)");
  LOGF("status", "free heap %u bytes, uptime %lu s", ESP.getFreeHeap(), millis() / 1000);
}

void post(const Command& c) {
  if (!shared::postCommand(c)) LOGF("console", "busy, try again");
}

void run(char* cmd) {
  char* argv[4] = {nullptr};
  int argc = 0;
  for (char* tok = strtok(cmd, " \t"); tok && argc < 4; tok = strtok(nullptr, " \t")) argv[argc++] = tok;
  if (argc == 0) return;
  const char* c0 = argv[0];
  Command c{};

  if (!strcmp(c0, "help") || !strcmp(c0, "?")) help();
  else if (!strcmp(c0, "status")) status();
  else if (!strcmp(c0, "watch")) {
    watch = !watch;
    LOGF("console", "watch %s", watch ? "on" : "off");
  } else if (!strcmp(c0, "fan") && argc == 2 && parseFanMode(argv[1], c.mode)) {
    c.type = CmdType::SetFanMode;
    post(c);
  } else if (!strcmp(c0, "thr") && argc == 3) {
    c.type = CmdType::SetFanThresholds;
    c.fanOnTemp = atof(argv[1]);
    c.fanOffTemp = atof(argv[2]);
    if (settings::isValidFanThresholds(c.fanOnTemp, c.fanOffTemp)) post(c);
    else LOGF("console", "invalid: 10–50 °C and on − off >= 1");
  } else if (!strcmp(c0, "cal") && argc == 2 && !strcmp(argv[1], "dry")) {
    c.type = CmdType::CalibrateSoilDry;
    post(c);
  } else if (!strcmp(c0, "cal") && argc == 2 && !strcmp(argv[1], "wet")) {
    c.type = CmdType::CalibrateSoilWet;
    post(c);
  } else if (!strcmp(c0, "cal") && argc == 3) {
    if (!settings::setSoilCalibration(atoi(argv[1]), atoi(argv[2]))) LOGF("console", "invalid mV values");
  } else if (!strcmp(c0, "active-low") && argc == 2) {
    c.type = CmdType::SetFanActiveLow;
    c.activeLow = strcmp(argv[1], "0") != 0;
    post(c);
  } else if (!strcmp(c0, "mqtt") && argc >= 2) {
    Settings s = settings::get();
    uint16_t port = argc >= 3 ? static_cast<uint16_t>(atoi(argv[2])) : s.mqttPort;
    if (!settings::setNetwork(argv[1], port, s.deviceId)) LOGF("console", "invalid host/port");
  } else if (!strcmp(c0, "id") && argc == 2) {
    Settings s = settings::get();
    if (!settings::setNetwork(s.mqttHost, s.mqttPort, argv[1]))
      LOGF("console", "invalid id: 1–32 of A-Z a-z 0-9 _ -");
  } else if (!strcmp(c0, "portal")) {
    shared::requestPortal();
  } else if (!strcmp(c0, "factory")) {
    settings::factoryReset();
    delay(200);
    ESP.restart();
  } else if (!strcmp(c0, "reboot")) {
    ESP.restart();
  } else {
    LOGF("console", "unknown command '%s' (type help)", c0);
  }
}

}  // namespace

void begin() { LOGF("console", "type 'help' for commands"); }

void update(uint32_t now) {
  while (Serial.available()) {
    char ch = static_cast<char>(Serial.read());
    if (ch == '\r') continue;
    if (ch == '\n') {
      line[len] = '\0';
      run(line);
      len = 0;
    } else if (len < sizeof(line) - 1) {
      line[len++] = ch;
    }
  }
  if (watch && static_cast<int32_t>(now - nextWatch) >= 0) {
    nextWatch = now + 1000;
    sensors::printRaw();
  }
}

bool watching() { return watch; }

}  // namespace console
