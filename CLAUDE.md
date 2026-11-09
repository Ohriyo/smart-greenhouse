# Smart Greenhouse

## Project
ESP32 smart greenhouse (30-pin DevKit on an expansion shield). Sensors: DHT22 (air temp + humidity, GPIO27), BH1750 (light, I2C GPIO21/22, addr 0x23), capacitive soil moisture v1.2 (analog GPIO34, raw → % via dry/wet calibration). Actuator: 12 V DC fan on GPIO26 via relay or logic-level MOSFET. NO soil temperature sensor — never add soil temperature fields.
The ESP32 runs fan hysteresis locally (default ON >= 32 °C, OFF <= 28 °C; thresholds in NVS) so ventilation works without Wi-Fi.

## Architecture
ESP32 --MQTT--> Mosquitto (laptop :1883) <--> backend (Node.js + TypeScript, Express, mqtt.js, Zod, Prisma + SQLite, rules engine, REST, Socket.IO, Expo push sender) <--> React Native Android app.
The app is the ONLY dashboard. It talks only to the backend (REST + Socket.IO), never to MQTT or the ESP32.
Topics: greenhouse/{deviceId}/telemetry (up), greenhouse/{deviceId}/status (up, retained, Last Will "offline"), greenhouse/{deviceId}/command (down).
Commands: app REST POST -> backend publishes MQTT command -> ESP32 applies -> confirmed state returns in telemetry. UI shows confirmed state only.
Alerts: backend rules engine creates alerts and sends closed-app push via Expo Push Service -> FCM -> Android phone.
A dev-only simulator publishes on the same topics and obeys commands.

## Environment
Backend on my laptop; Android phone and ESP32 on the same Wi-Fi. Single user, no login. Laptop LAN IP configurable everywhere (backend .env, app Settings, ESP32 WiFiManager portal).
Target: ANDROID ONLY. Do not add iOS-specific config or code. Test device: my Android phone (Expo Go for phases before push; Expo development build from the push phase onward).

## Folders
backend/ (Node + TS, includes simulator) · mobile/ (Expo app) · firmware/ (PlatformIO) · docs/

## Mobile stack
Expo + TypeScript strict, Expo Router (tabs), TanStack Query, Zustand, socket.io-client (match backend major), fetch wrapper (no axios), Zod (mirrors docs/api-contract.md), react-native-svg (all charts, drawn in src/components/ui), react-native-reanimated + react-native-gesture-handler (animation, gestures), @expo-google-fonts/inter, @expo/vector-icons, expo-notifications + expo-device, AsyncStorage, @react-native-community/netinfo. Use `npx expo install`.
Structure: app/ (routes only: _layout, (tabs)/index=Dashboard, history, alerts, control, settings) · src/{components/ui, components/greenhouse, features, services/api, services/realtime, services/notifications, store, types, theme, constants, utils} · assets/

## Rules
- One phase at a time. When done: stop, summarize, list changed files, give manual verification steps, wait for my go-ahead.
- Check code before assuming anything exists. docs/api-contract.md is the single source of truth — update it whenever the API changes.
- Minimal, stable dependencies. No `any`. Validate external data with Zod.
- Explain every terminal command. I use Windows.
