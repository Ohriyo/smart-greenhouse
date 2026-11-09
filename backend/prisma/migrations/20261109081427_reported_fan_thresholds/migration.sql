-- AlterTable
ALTER TABLE "Device" ADD COLUMN "reportedFanOffTemp" REAL;
ALTER TABLE "Device" ADD COLUMN "reportedFanOnTemp" REAL;
ALTER TABLE "Device" ADD COLUMN "reportedFanThresholdsAt" DATETIME;
