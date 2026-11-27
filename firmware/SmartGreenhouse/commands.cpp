#include "commands.h"

#include <time.h>

#include "config.h"
#include "log.h"
#include "sensors.h"
#include "settings.h"

namespace commands {
namespace {

/** Contract §4: ignore commands issued more than 150 s ago (only if our clock is set). */
bool isStale(const char* issuedAt, long& ageSec) {
  ageSec = 0;
  if (!issuedAt || !clockIsSet()) return false;
  struct tm t = {};
  if (sscanf(issuedAt, "%d-%d-%dT%d:%d:%d", &t.tm_year, &t.tm_mon, &t.tm_mday, &t.tm_hour,
             &t.tm_min, &t.tm_sec) != 6) {
    return false;
  }
  t.tm_year -= 1900;
  t.tm_mon -= 1;
  time_t issued = mktime(&t);  // TZ is UTC (never changed)
  ageSec = static_cast<long>(time(nullptr) - issued);
  return ageSec > static_cast<long>(cfg::MAX_COMMAND_AGE_S);
}

void captureSoilPoint(bool dry) {
  sensors::Readings r = sensors::get();
  if (!r.soilRawOk) {
    LOGF("cal", "cannot capture %s point: soil reading invalid (%d mV)", dry ? "DRY" : "WET", r.soilMv);
    return;
  }
  if (dry) settings::setSoilDry(static_cast<uint16_t>(r.soilMv));
  else settings::setSoilWet(static_cast<uint16_t>(r.soilMv));
  Settings s = settings::get();
  if (s.soilDryMv < s.soilWetMv + cfg::SOIL_MIN_CAL_SPAN_MV) {
    LOGF("cal", "WARNING: dry (%u mV) should be well above wet (%u mV); capture the other point too",
         s.soilDryMv, s.soilWetMv);
  }
}

}  // namespace

bool clockIsSet() { return time(nullptr) > 1700000000; }  // after Nov 2023 = NTP synced

bool parse(JsonObjectConst cmd, Command& c) {
  const char* type = cmd["type"] | "";
  const char* id = cmd["id"] | "?";
  long age = 0;
  if (isStale(cmd["issuedAt"] | static_cast<const char*>(nullptr), age)) {
    LOGF("cmd", "ignored stale %s (%ld s old) id=%s", type, age, id);
    return false;
  }

  c = Command{};
  if (strcmp(type, "calibrateSoil") == 0) {
    const char* point = cmd["point"] | "";
    if (strcmp(point, "dry") == 0) c.type = CmdType::CalibrateSoilDry;
    else if (strcmp(point, "wet") == 0) c.type = CmdType::CalibrateSoilWet;
    else {
      LOGF("cmd", "ignored calibrateSoil: point must be dry or wet");
      return false;
    }
  } else {
    // e.g. "simulate" (dev simulator only) or a type from a newer backend.
    LOGF("cmd", "ignored unknown command type '%s'", type);
    return false;
  }
  LOGF("cmd", "received %s id=%s", type, id);
  return true;
}

void apply(const Command& c) {
  switch (c.type) {
    case CmdType::CalibrateSoilDry:
    case CmdType::CalibrateSoilWet:
      captureSoilPoint(c.type == CmdType::CalibrateSoilDry);
      break;
  }
  shared::requestReading();  // report the new state right away (= acknowledgement)
}

}  // namespace commands
