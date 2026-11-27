#include "settings.h"

#include <Preferences.h>

#include "config.h"
#include "log.h"

namespace settings {
namespace {

constexpr const char* NS = "greenhouse";
Preferences prefs;
Settings current;
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

void copyStr(char* dst, size_t size, const char* src) {
  strncpy(dst, src, size - 1);
  dst[size - 1] = '\0';
}

// Writes under the lock, then saves to flash outside it (flash writes are slow).
template <typename Fn>
void update(Fn fn) {
  portENTER_CRITICAL(&mux);
  fn(current);
  portEXIT_CRITICAL(&mux);
}

}  // namespace

bool isValidDeviceId(const char* id) {
  size_t n = strlen(id);
  if (n == 0 || n > 32) return false;
  for (size_t i = 0; i < n; i++) {
    char c = id[i];
    if (!(isalnum(static_cast<unsigned char>(c)) || c == '_' || c == '-')) return false;
  }
  return true;
}

void begin() {
  prefs.begin(NS, false);
  // Only read keys that exist: the core logs a scary "NOT_FOUND" error otherwise.
  auto has = [](const char* key) { return prefs.isKey(key); };
  Settings s{};
  String id = has("devId") ? prefs.getString("devId") : String(cfg::DEFAULT_DEVICE_ID);
  copyStr(s.deviceId, sizeof(s.deviceId),
          isValidDeviceId(id.c_str()) ? id.c_str() : cfg::DEFAULT_DEVICE_ID);
  s.soilDryMv = has("soilDry") ? prefs.getUShort("soilDry") : cfg::DEFAULT_SOIL_DRY_MV;
  s.soilWetMv = has("soilWet") ? prefs.getUShort("soilWet") : cfg::DEFAULT_SOIL_WET_MV;
  update([&](Settings& c) { c = s; });
}

Settings get() {
  Settings copy;
  portENTER_CRITICAL(&mux);
  copy = current;
  portEXIT_CRITICAL(&mux);
  return copy;
}

void print() {
  Settings s = get();
  LOGF("settings", "device id      : %s", s.deviceId);
  LOGF("settings", "soil dry / wet : %u / %u mV", s.soilDryMv, s.soilWetMv);
}

bool setDeviceId(const char* id) {
  if (!id || !isValidDeviceId(id)) return false;
  update([&](Settings& c) { copyStr(c.deviceId, sizeof(c.deviceId), id); });
  prefs.putString("devId", id);
  LOGF("settings", "device id saved: %s (used from the next reading)", id);
  return true;
}

void setSoilDry(uint16_t mv) {
  update([&](Settings& c) { c.soilDryMv = mv; });
  prefs.putUShort("soilDry", mv);
  LOGF("settings", "soil DRY point saved: %u mV", mv);
}

void setSoilWet(uint16_t mv) {
  update([&](Settings& c) { c.soilWetMv = mv; });
  prefs.putUShort("soilWet", mv);
  LOGF("settings", "soil WET point saved: %u mV", mv);
}

bool setSoilCalibration(uint16_t dryMv, uint16_t wetMv) {
  if (dryMv > 3300 || wetMv > 3300) return false;
  setSoilDry(dryMv);
  setSoilWet(wetMv);
  return true;
}

void factoryReset() {
  prefs.clear();
  LOGF("settings", "NVS settings erased; defaults apply after reboot");
}

}  // namespace settings
