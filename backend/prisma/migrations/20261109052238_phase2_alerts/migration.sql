-- AlterTable
ALTER TABLE "Device" ADD COLUMN "telemetryIntervalSec" INTEGER;

-- CreateIndex
CREATE INDEX "Alert_deviceId_metric_idx" ON "Alert"("deviceId", "metric");
