#include "console.h"

#include "log.h"
#include "sensors.h"
#include "settings.h"
#include "shared.h"
#include "uplink.h"

namespace console {
namespace {

char line[96];
size_t len = 0;
bool watch = false;
uint32_t nextWatch = 0;

void help() {
  Serial.println(F(
      "\nCommands:\n"
      "  status                   settings, Wi-Fi, server, sensor values\n"
      "  watch                    toggle raw sensor print every 1 s\n"
      "  post                     send a reading to the server now\n"
      "  cal dry                  soil sensor in AIR now: save as 0 %\n"
      "  cal wet                  soil sensor in WATER now: save as 100 %\n"
      "  cal <dryMv> <wetMv>      set calibration numbers directly\n"
      "  id <deviceId>            greenhouse id sent with each reading (default gh-01)\n"
      "  factory                  erase saved settings, then reboot\n"
      "  reboot\n"
      "Wi-Fi, server URL and device key are in secrets.h (reflash to change).\n"));
}

void status() {
  settings::print();
  uplink::printStatus();
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
  } else if (!strcmp(c0, "post")) {
    shared::requestReading();
  } else if (!strcmp(c0, "cal") && argc == 2 && !strcmp(argv[1], "dry")) {
    c.type = CmdType::CalibrateSoilDry;
    post(c);
  } else if (!strcmp(c0, "cal") && argc == 2 && !strcmp(argv[1], "wet")) {
    c.type = CmdType::CalibrateSoilWet;
    post(c);
  } else if (!strcmp(c0, "cal") && argc == 3) {
    if (!settings::setSoilCalibration(atoi(argv[1]), atoi(argv[2]))) LOGF("console", "invalid mV values");
  } else if (!strcmp(c0, "id") && argc == 2) {
    if (!settings::setDeviceId(argv[1])) LOGF("console", "invalid id: 1–32 of A-Z a-z 0-9 _ -");
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
