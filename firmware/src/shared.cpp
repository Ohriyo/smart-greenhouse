#include "shared.h"

#include <atomic>

const char* fanModeName(FanMode mode) {
  switch (mode) {
    case FanMode::On:
      return "on";
    case FanMode::Off:
      return "off";
    case FanMode::Auto:
    default:
      return "auto";
  }
}

bool parseFanMode(const char* text, FanMode& out) {
  if (!text) return false;
  if (strcmp(text, "auto") == 0) out = FanMode::Auto;
  else if (strcmp(text, "on") == 0) out = FanMode::On;
  else if (strcmp(text, "off") == 0) out = FanMode::Off;
  else return false;
  return true;
}

namespace shared {
namespace {
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
Snapshot snap;
QueueHandle_t queue = nullptr;
std::atomic<bool> telemetryRequested{false};
std::atomic<bool> portalRequested{false};
}  // namespace

void begin() { queue = xQueueCreate(8, sizeof(Command)); }

void setSnapshot(const Snapshot& s) {
  portENTER_CRITICAL(&mux);
  snap = s;
  portEXIT_CRITICAL(&mux);
}

Snapshot snapshot() {
  portENTER_CRITICAL(&mux);
  Snapshot copy = snap;
  portEXIT_CRITICAL(&mux);
  return copy;
}

bool postCommand(const Command& c) { return queue && xQueueSend(queue, &c, 0) == pdTRUE; }
bool takeCommand(Command& c) { return queue && xQueueReceive(queue, &c, 0) == pdTRUE; }

void requestTelemetry() { telemetryRequested = true; }
bool takeTelemetryRequest() { return telemetryRequested.exchange(false); }
void requestPortal() { portalRequested = true; }
bool takePortalRequest() { return portalRequested.exchange(false); }

}  // namespace shared
