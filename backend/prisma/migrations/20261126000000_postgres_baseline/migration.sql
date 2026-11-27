-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastSeen" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "telemetryIntervalSec" INTEGER,
    "rssi" INTEGER,
    "uptimeSec" INTEGER,
    "uptimeAt" TIMESTAMPTZ(3),
    "soilDryMv" INTEGER,
    "soilWetMv" INTEGER,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reading" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "ts" TIMESTAMPTZ(3) NOT NULL,
    "airTemp" DOUBLE PRECISION,
    "humidity" DOUBLE PRECISION,
    "soilMoisture" DOUBLE PRECISION,
    "soilRaw" INTEGER,
    "lux" DOUBLE PRECISION,
    "rssi" INTEGER,

    CONSTRAINT "Reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thresholds" (
    "deviceId" TEXT NOT NULL,
    "airTempMin" DOUBLE PRECISION DEFAULT 15,
    "airTempMax" DOUBLE PRECISION DEFAULT 35,
    "humidityMin" DOUBLE PRECISION DEFAULT 40,
    "humidityMax" DOUBLE PRECISION DEFAULT 85,
    "soilMoistureMin" DOUBLE PRECISION DEFAULT 30,
    "soilMoistureMax" DOUBLE PRECISION DEFAULT 80,
    "luxMin" DOUBLE PRECISION,
    "luxMax" DOUBLE PRECISION,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Thresholds_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "ts" TIMESTAMPTZ(3) NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "metric" TEXT,
    "value" DOUBLE PRECISION,
    "limitValue" DOUBLE PRECISION,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minSeverity" TEXT NOT NULL DEFAULT 'warning',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "offlineAfterMin" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SmsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsLog" (
    "id" SERIAL NOT NULL,
    "ts" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "deviceId" TEXT,
    "metric" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "providerId" TEXT,

    CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsEpisode" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "SmsEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reading_deviceId_ts_idx" ON "Reading"("deviceId", "ts");

-- CreateIndex
CREATE INDEX "Reading_ts_idx" ON "Reading"("ts");

-- CreateIndex
CREATE INDEX "Alert_deviceId_ts_idx" ON "Alert"("deviceId", "ts");

-- CreateIndex
CREATE INDEX "Alert_deviceId_metric_idx" ON "Alert"("deviceId", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "SmsLog_ts_idx" ON "SmsLog"("ts");

-- CreateIndex
CREATE INDEX "SmsEpisode_deviceId_metric_closedAt_idx" ON "SmsEpisode"("deviceId", "metric", "closedAt");

-- AddForeignKey
ALTER TABLE "Reading" ADD CONSTRAINT "Reading_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thresholds" ADD CONSTRAINT "Thresholds_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
