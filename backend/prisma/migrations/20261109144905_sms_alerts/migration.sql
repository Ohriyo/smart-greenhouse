-- CreateTable
CREATE TABLE "SmsSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "offlineAfterMin" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SmsLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "deviceId" TEXT,
    "metric" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "providerId" TEXT
);

-- CreateTable
CREATE TABLE "SmsEpisode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "deviceId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveredAt" DATETIME,
    "closedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "SmsLog_ts_idx" ON "SmsLog"("ts");

-- CreateIndex
CREATE INDEX "SmsEpisode_deviceId_metric_closedAt_idx" ON "SmsEpisode"("deviceId", "metric", "closedAt");
