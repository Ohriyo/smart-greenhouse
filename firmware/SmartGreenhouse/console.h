#pragma once
// Serial console for bring-up (115200 baud, newline-terminated). Type "help".

#include <Arduino.h>

namespace console {
void begin();
void update(uint32_t now);  // non-blocking: reads available characters only
bool watching();            // "watch" mode prints raw sensor values every second
}  // namespace console
