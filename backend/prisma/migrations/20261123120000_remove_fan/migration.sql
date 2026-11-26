-- DropIndex
DROP INDEX "FanEvent_deviceId_ts_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "FanEvent";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastSeen" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "telemetryIntervalSec" INTEGER,
    "rssi" INTEGER,
    "uptimeSec" INTEGER,
    "uptimeAt" DATETIME,
    "soilDryMv" INTEGER,
    "soilWetMv" INTEGER
);
INSERT INTO "new_Device" ("createdAt", "id", "lastSeen", "name", "online", "rssi", "soilDryMv", "soilWetMv", "telemetryIntervalSec", "uptimeAt", "uptimeSec") SELECT "createdAt", "id", "lastSeen", "name", "online", "rssi", "soilDryMv", "soilWetMv", "telemetryIntervalSec", "uptimeAt", "uptimeSec" FROM "Device";
DROP TABLE "Device";
ALTER TABLE "new_Device" RENAME TO "Device";
CREATE TABLE "new_Reading" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "deviceId" TEXT NOT NULL,
    "ts" DATETIME NOT NULL,
    "airTemp" REAL,
    "humidity" REAL,
    "soilMoisture" REAL,
    "soilRaw" INTEGER,
    "lux" REAL,
    "rssi" INTEGER,
    CONSTRAINT "Reading_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Reading" ("airTemp", "deviceId", "humidity", "id", "lux", "rssi", "soilMoisture", "soilRaw", "ts") SELECT "airTemp", "deviceId", "humidity", "id", "lux", "rssi", "soilMoisture", "soilRaw", "ts" FROM "Reading";
DROP TABLE "Reading";
ALTER TABLE "new_Reading" RENAME TO "Reading";
CREATE INDEX "Reading_deviceId_ts_idx" ON "Reading"("deviceId", "ts");
CREATE TABLE "new_SmsEpisode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "deviceId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME
);
INSERT INTO "new_SmsEpisode" ("closedAt", "deviceId", "id", "metric", "openedAt") SELECT "closedAt", "deviceId", "id", "metric", "openedAt" FROM "SmsEpisode";
DROP TABLE "SmsEpisode";
ALTER TABLE "new_SmsEpisode" RENAME TO "SmsEpisode";
CREATE INDEX "SmsEpisode_deviceId_metric_closedAt_idx" ON "SmsEpisode"("deviceId", "metric", "closedAt");
CREATE TABLE "new_Thresholds" (
    "deviceId" TEXT NOT NULL PRIMARY KEY,
    "airTempMin" REAL DEFAULT 15,
    "airTempMax" REAL DEFAULT 35,
    "humidityMin" REAL DEFAULT 40,
    "humidityMax" REAL DEFAULT 85,
    "soilMoistureMin" REAL DEFAULT 30,
    "soilMoistureMax" REAL DEFAULT 80,
    "luxMin" REAL,
    "luxMax" REAL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Thresholds_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Thresholds" ("airTempMax", "airTempMin", "deviceId", "humidityMax", "humidityMin", "luxMax", "luxMin", "soilMoistureMax", "soilMoistureMin", "updatedAt") SELECT "airTempMax", "airTempMin", "deviceId", "humidityMax", "humidityMin", "luxMax", "luxMin", "soilMoistureMax", "soilMoistureMin", "updatedAt" FROM "Thresholds";
DROP TABLE "Thresholds";
ALTER TABLE "new_Thresholds" RENAME TO "Thresholds";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
