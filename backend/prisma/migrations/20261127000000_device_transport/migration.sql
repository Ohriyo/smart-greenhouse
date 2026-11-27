-- How the latest reading arrived: "mqtt" (broker) or "https" (POST /api/readings fallback).
ALTER TABLE "Device" ADD COLUMN "transport" TEXT;
