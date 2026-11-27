#pragma once
// Wi-Fi, MQTT and the HTTPS fallback, in their own FreeRTOS task (core 0).
// Every 30 s (cfg::READING_INTERVAL_MS) the latest values go out (contract §2, §4):
// - over MQTT (main): greenhouse/{id}/telemetry through the broker (EMQX, TLS 8883).
//   The broker keeps a retained "online" on greenhouse/{id}/status and publishes the
//   Last Will "offline" if the ESP32 vanishes. Commands arrive on greenhouse/{id}/command.
// - over HTTPS (fallback, whenever MQTT isn't connected): POST SERVER_URL/api/readings
//   with X-Device-Key; commands come back in the response.
// While on MQTT, GET SERVER_URL/health every 10 min keeps Render's free service awake.
// A slow TLS handshake or a sleeping server can block this task for up to the
// timeouts, never the sensor reading in loop() (core 1).
// (Not named network.h: esp32 core 3.x+ has its own Network.h, and Windows
// file names ignore case.)

#include <Arduino.h>

namespace uplink {

enum class State : uint8_t {
  NoWifi,       // not connected to Wi-Fi
  NoServer,     // Wi-Fi ok, but neither MQTT nor the last HTTPS reading worked (or none yet)
  OnlineHttps,  // MQTT unavailable, readings go over HTTPS (fallback)
  Online,       // connected to the MQTT broker
};

void begin();  // starts the uplink task
State state();
const char* stateName(State s);
void printStatus();  // Wi-Fi, MQTT, HTTPS, for the console's "status"

}  // namespace uplink
