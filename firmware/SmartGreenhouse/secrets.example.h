#pragma once
// TEMPLATE. Copy this file to secrets.h (same folder) and fill in your values.
// secrets.h is git-ignored: never commit Wi-Fi passwords or the device key.

// The Wi-Fi the greenhouse joins (2.4 GHz). For a demo, a phone hotspot works.
#define WIFI_SSID "your-wifi-or-hotspot-name"
#define WIFI_PASSWORD "your-wifi-password"

// The deployed backend, HTTPS, no trailing slash. Readings go to SERVER_URL/api/readings.
#define SERVER_URL "https://your-service.onrender.com"

// Must equal DEVICE_API_KEY in the backend's environment (Render → Environment).
#define DEVICE_KEY "paste-the-same-long-random-key-here"
