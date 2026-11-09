#pragma once
// Wi-Fi, MQTT, NTP and the WiFiManager setup portal, in their own FreeRTOS task
// (core 0). PubSubClient's connect() blocks for seconds when the broker is down;
// running here means that can never delay the fan logic in loop() (core 1).

#include <Arduino.h>

namespace net {

enum class State : uint8_t { Portal, NoWifi, NoMqtt, Online };

void begin();  // starts the network task
State state();
const char* stateName(State s);

}  // namespace net
