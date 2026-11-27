// Smart Greenhouse ESP32 firmware: Arduino IDE sketch.
//
// This file is intentionally empty: setup() and loop() are in main.cpp, and the
// rest of the code is in the other tabs. Full guide: docs/firmware.md.
//
// FIRST: copy secrets.example.h to secrets.h and fill in Wi-Fi, the MQTT broker
// (EMQX), server URL and device key (secrets.h is git-ignored).
//
// Board package (Tools → Board → Boards Manager): "esp32" by Espressif Systems,
//   version 4.0.0 (compiled with it on 2026-11-27).
//
// Libraries (Sketch → Include Library → Manage Libraries):
//   DHT sensor library         by Adafruit          1.4.7
//   Adafruit Unified Sensor    by Adafruit          1.1.15
//   BH1750                     by Christopher Laws  1.3.0
//   ArduinoJson                by Benoit Blanchon   7.4.3
//   PubSubClient               by Nick O'Leary      2.8
// (Wi-Fi, WiFiClientSecure and HTTPClient come with the board package.)
//
// Tools menu:
//   Board: "ESP32 Dev Module"     Port: the CP2102 port (COM10 on this laptop)
//   Core Debug Level: "Error"     Erase All Flash Before Sketch Upload: "Disabled"
//   (everything else: defaults; Partition Scheme "Default 4MB with spiffs")
//
// Serial Monitor: 115200 baud, line ending "New Line"; type "help".
