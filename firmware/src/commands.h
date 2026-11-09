#pragma once
// Commands from MQTT (the backend), the serial console and the setup portal.
//
// parseMqtt() runs in the network task: JSON → validated Command. Malformed JSON,
// unknown types, out-of-range values and stale commands are logged and ignored.
// apply() runs in the control loop only: it applies the command, saves it to NVS
// and requests telemetry right away, which is the acknowledgement (contract §4).

#include <Arduino.h>

#include "shared.h"

namespace commands {

bool clockIsSet();  // true once NTP has set the clock

/** Parses greenhouse/{id}/command. Returns false (and logs why) if it must be ignored. */
bool parseMqtt(const uint8_t* payload, unsigned int length, Command& out);

/** Applies a command (control loop only). */
void apply(const Command& c);

}  // namespace commands
