#pragma once
// Tiny serial logger: "[   12.345] [fan] message". Safe to call from both tasks.

#include <Arduino.h>

#define LOGF(tag, fmt, ...)                                                        \
  Serial.printf("[%8lu.%03lu] [%s] " fmt "\n", (unsigned long)(millis() / 1000), \
                (unsigned long)(millis() % 1000), tag, ##__VA_ARGS__)
