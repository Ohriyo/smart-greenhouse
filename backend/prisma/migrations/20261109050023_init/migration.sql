-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastSeen" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Reading" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "deviceId" TEXT NOT NULL,
    "ts" DATETIME NOT NULL,
    "airTemp" REAL,
    "humidity" REAL,
    "soilMoisture" REAL,
    "soilRaw" INTEGER,
    "lux" REAL,
    "fanOn" BOOLEAN NOT NULL,
    "fanMode" TEXT NOT NULL,
    "rssi" INTEGER,
    CONSTRAINT "Reading_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Thresholds" (
    "deviceId" TEXT NOT NULL PRIMARY KEY,
    "fanOnTemp" REAL NOT NULL DEFAULT 32,
    "fanOffTemp" REAL NOT NULL DEFAULT 28,
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

-- CreateTable
CREATE TABLE "Alert" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "deviceId" TEXT NOT NULL,
    "ts" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "metric" TEXT,
    "value" REAL,
    "message" TEXT NOT NULL,
    "readAt" DATETIME,
    CONSTRAINT "Alert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FanEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "deviceId" TEXT NOT NULL,
    "ts" DATETIME NOT NULL,
    "fanOn" BOOLEAN NOT NULL,
    "fanMode" TEXT NOT NULL,
    "airTemp" REAL,
    CONSTRAINT "FanEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Reading_deviceId_ts_idx" ON "Reading"("deviceId", "ts");

-- CreateIndex
CREATE INDEX "Alert_deviceId_ts_idx" ON "Alert"("deviceId", "ts");

-- CreateIndex
CREATE INDEX "FanEvent_deviceId_ts_idx" ON "FanEvent"("deviceId", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");
