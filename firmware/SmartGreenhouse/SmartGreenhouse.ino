// Smart Greenhouse ESP32 firmware: Arduino IDE sketch.
//
// This file is intentionally empty: setup() and loop() are in main.cpp, and the
// rest of the code is in the other tabs. Full guide: docs/firmware.md.
//
// Board package (Tools → Board → Boards Manager): "esp32" by Espressif Systems,
//   version 2.0.17 exactly (NOT 3.x; this code is built and tested on 2.0.17).
//
// Libraries (Sketch → Include Library → Manage Libraries), exact versions:
//   DHT sensor library         by Adafruit          1.4.7
//   Adafruit Unified Sensor    by Adafruit          1.1.15
//   BH1750                     by Christopher Laws  1.3.0
//   PubSubClient               by Nick O'Leary      2.8
//   ArduinoJson                by Benoit Blanchon   7.4.3
//   WiFiManager                by tzapu             2.0.17
//
// Tools menu:
//   Board: "ESP32 Dev Module"     Port: the CP2102 port (COM10 on this laptop)
//   Core Debug Level: "Error"     Erase All Flash Before Sketch Upload: "Disabled"
//   (everything else: defaults; Partition Scheme "Default 4MB with spiffs")
//
// Serial Monitor: 115200 baud, line ending "New Line"; type "help".
