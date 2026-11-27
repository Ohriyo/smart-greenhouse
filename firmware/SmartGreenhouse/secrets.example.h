#pragma once
// TEMPLATE. Copy this file to secrets.h (same folder) and fill in your values.
// secrets.h is git-ignored: never commit Wi-Fi passwords, the device key or the
// MQTT password.

// The Wi-Fi the greenhouse joins (2.4 GHz). For a demo, a phone hotspot works.
#define WIFI_SSID "your-wifi-or-hotspot-name"
#define WIFI_PASSWORD "your-wifi-password"

// ---------- MQTT: the main transport (docs/setup-emqx.md) ----------
// EMQX console → your Serverless deployment → Overview: "Address" and the MQTT over
// TLS/SSL port (8883). Only the host name: no "mqtts://", no port.
// Leave MQTT_HOST empty ("") to send every reading over HTTPS instead.
#define MQTT_HOST "xxxxxxxx.ala.asia-southeast1.emqxsl.com"
#define MQTT_PORT 8883
// The DEVICE's login (EMQX → Access Control → Authentication), not the backend's.
#define MQTT_USERNAME "greenhouse-device"
#define MQTT_PASSWORD "the-device-password-from-emqx"

// ---------- HTTPS: the fallback, and the keep-awake ping ----------
// The deployed backend, HTTPS, no trailing slash. Used when MQTT can't connect
// (POST SERVER_URL/api/readings) and every 10 min for GET SERVER_URL/health, which
// keeps Render's free service awake (it sleeps after 15 min without HTTP traffic).
#define SERVER_URL "https://your-service.onrender.com"

// Must equal DEVICE_API_KEY in the backend's environment (Render → Environment).
#define DEVICE_KEY "paste-the-same-long-random-key-here"
