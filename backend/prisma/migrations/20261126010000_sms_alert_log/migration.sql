-- DropTable
DROP TABLE "SmsSettings";

-- DropTable
DROP TABLE "SmsLog";

-- DropTable
DROP TABLE "SmsEpisode";

-- CreateTable
CREATE TABLE "SmsAlert" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "deviceId" TEXT,
    "alertId" INTEGER,
    "sensor" TEXT,
    "condition" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "message" TEXT NOT NULL,
    "recipients" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerResponse" TEXT,

    CONSTRAINT "SmsAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsAlert_createdAt_idx" ON "SmsAlert"("createdAt");

-- CreateIndex
CREATE INDEX "SmsAlert_deviceId_condition_createdAt_idx" ON "SmsAlert"("deviceId", "condition", "createdAt");

-- CreateIndex
CREATE INDEX "SmsAlert_alertId_idx" ON "SmsAlert"("alertId");

-- AddForeignKey
ALTER TABLE "SmsAlert" ADD CONSTRAINT "SmsAlert_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE SET NULL ON UPDATE CASCADE;
