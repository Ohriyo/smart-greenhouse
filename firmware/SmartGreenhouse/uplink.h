#pragma once
// Wi-Fi and the HTTPS uplink, in their own FreeRTOS task (core 0). Every 30 s
// (cfg::READING_INTERVAL_MS) the latest values are POSTed to
// SERVER_URL/api/readings with the X-Device-Key header (contract §2, §4).
// Commands queued by the backend come back in the response.
// A slow TLS handshake or a sleeping server can block this task for up to the
// HTTP timeout, never the sensor reading in loop() (core 1).
// (Not named network.h: esp32 core 3.x+ has its own Network.h, and Windows
// file names ignore case.)

#include <Arduino.h>

namespace uplink {

enum class State : uint8_t {
  NoWifi,    // not connected to Wi-Fi
  NoServer,  // Wi-Fi ok, but the last POST failed (or none yet)
  Online,    // the last POST was accepted
};

void begin();  // starts the uplink task
State state();
const char* stateName(State s);
void printStatus();  // Wi-Fi + last POST, for the console's "status"

}  // namespace uplink
