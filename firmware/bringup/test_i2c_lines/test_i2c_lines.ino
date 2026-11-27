#include <Wire.h>

void scan(int sda, int scl) {
  Wire.end();
  Wire.begin(sda, scl);
  Wire.setClock(10000); // slow clock for flaky wiring
  delay(50);
  Serial.printf("Scan with SDA=%d, SCL=%d: ", sda, scl);
  int found = 0;
  for (byte a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) { Serial.printf("0x%02X ", a); found++; }
  }
  Serial.println(found ? "" : "nothing");
}

void setup() { Serial.begin(115200); delay(500); }

void loop() {
  scan(25, 33); // as wired in the diagram
  scan(33, 25); // SDA and SCL swapped
  Serial.println();
  delay(3000);
}