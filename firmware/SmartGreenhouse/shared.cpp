#include "shared.h"

#include <atomic>

namespace shared {
namespace {
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
Snapshot snap;
QueueHandle_t queue = nullptr;
std::atomic<bool> readingRequested{false};
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

void requestReading() { readingRequested = true; }
bool takeReadingRequest() { return readingRequested.exchange(false); }

}  // namespace shared
