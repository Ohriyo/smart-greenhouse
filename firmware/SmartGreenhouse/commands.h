#pragma once
// Commands from the backend (a message on greenhouse/{id}/command, or the
// "commands" array of a POST /api/readings response) and the serial console.
//
// parse() runs in the uplink task: JSON object → validated Command. Unknown
// types, invalid values and stale commands are logged and ignored.
// apply() runs in the control loop only: it applies the command, saves it to NVS
// and requests a reading right away, which is the acknowledgement (contract §4).

#include <Arduino.h>
#include <ArduinoJson.h>

#include "shared.h"

namespace commands {

bool clockIsSet();  // true once NTP has set the clock

/** One element of "commands". Returns false (and logs why) if it must be ignored. */
bool parse(JsonObjectConst cmd, Command& out);

/** Applies a command (control loop only). */
void apply(const Command& c);

}  // namespace commands
