#include "network.h"

#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <sys/time.h>
#include <time.h>

#include <atomic>

#include "commands.h"
#include "config.h"
#include "log.h"
#include "settings.h"
#include "shared.h"

namespace net {
namespace {

std::atomic<uint8_t> currentState{static_cast<uint8_t>(State::NoWifi)};
void setState(State s) { currentState = static_cast<uint8_t>(s); }

// ---------- Reconnect timer (Wi-Fi and MQTT): one attempt every 5 s ----------

struct Retry {
  uint32_t nextAt = 0;
  bool due(uint32_t now) const { return static_cast<int32_t>(now - nextAt) >= 0; }
  void asap() { nextAt = millis(); }  // try right away
  /** Schedules the next attempt; returns the wait in ms. */
  uint32_t after(uint32_t now, uint32_t waitMs) {
    nextAt = now + waitMs;
    return waitMs;
  }
};

// ---------- Wi-Fi + setup portal ----------

WiFiManager wm;
char apName[32];
WiFiManagerParameter pHeader("<p>Smart Greenhouse: MQTT broker = the laptop running Mosquitto</p>");
WiFiManagerParameter pHost("mqtt_host", "MQTT broker host (laptop LAN IP)", "", 64);
WiFiManagerParameter pPort("mqtt_port", "MQTT port", "1883", 6);
WiFiManagerParameter pDeviceId("device_id", "Device ID (A-Z a-z 0-9 _ -)", "", 32);
WiFiManagerParameter pActiveLow("fan_low", "Fan output: 1 = relay (active-LOW), 0 = MOSFET", "1", 2);

bool portalOpen = false;
bool wifiWasUp = false;
Retry wifiRetry;

void onSaveParams() {
  // Runs in this task; NVS writes happen in the control loop (posted as commands).
  Command c{};
  c.type = CmdType::SetNetwork;
  strncpy(c.host, pHost.getValue(), sizeof(c.host) - 1);
  long port = atol(pPort.getValue());
  c.port = (port > 0 && port <= 65535) ? static_cast<uint16_t>(port) : 0;
  strncpy(c.deviceId, pDeviceId.getValue(), sizeof(c.deviceId) - 1);
  if (!c.host[0] || !c.port || !settings::isValidDeviceId(c.deviceId)) {
    LOGF("portal", "INVALID settings ignored: host '%s', port '%s', id '%s'", pHost.getValue(),
         pPort.getValue(), pDeviceId.getValue());
  } else {
    shared::postCommand(c);
  }
  Command a{};
  a.type = CmdType::SetFanActiveLow;
  a.activeLow = strcmp(pActiveLow.getValue(), "0") != 0;
  shared::postCommand(a);
}

void openPortal() {
  Settings s = settings::get();
  char port[8];
  snprintf(port, sizeof(port), "%u", s.mqttPort);
  pHost.setValue(s.mqttHost, 64);
  pPort.setValue(port, 6);
  pDeviceId.setValue(s.deviceId, 32);
  pActiveLow.setValue(s.fanActiveLow ? "1" : "0", 2);
  LOGF("portal", "setup portal OPEN: join Wi-Fi \"%s\" (password \"%s\"), open http://192.168.4.1",
       apName, cfg::PORTAL_PASSWORD);
  LOGF("portal", "closes by itself after %lu s; the fan keeps working meanwhile",
       (unsigned long)cfg::PORTAL_TIMEOUT_S);
  portalOpen = true;
  setState(State::Portal);
  wm.startConfigPortal(apName, cfg::PORTAL_PASSWORD);  // non-blocking (see begin)
}

void closedPortal() {
  portalOpen = false;
  LOGF("portal", "setup portal closed");
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  wifiRetry.asap();  // reconnect right away with the (maybe new) credentials
}

void maintainWifi(uint32_t now) {
  bool up = WiFi.status() == WL_CONNECTED;
  if (up != wifiWasUp) {
    wifiWasUp = up;
    if (up) {
      LOGF("wifi", "connected to \"%s\", IP %s, RSSI %d dBm", WiFi.SSID().c_str(),
           WiFi.localIP().toString().c_str(), WiFi.RSSI());
      configTime(0, 0, "pool.ntp.org", "time.google.com");  // UTC; non-blocking SNTP
    } else {
      LOGF("wifi", "disconnected; reconnecting every %lu s (fan logic unaffected)",
           (unsigned long)(cfg::RECONNECT_INTERVAL_MS / 1000));
    }
  }
  if (up || !wifiRetry.due(now)) return;
  if (!wm.getWiFiIsSaved()) {
    LOGF("wifi", "no Wi-Fi saved yet");
    openPortal();
    return;
  }
  WiFi.disconnect(false, false);
  WiFi.begin();  // saved credentials; non-blocking
  // An attempt gets WIFI_CONNECT_WINDOW_MS to associate, then the next one starts 5 s later.
  uint32_t wait = wifiRetry.after(now, cfg::WIFI_CONNECT_WINDOW_MS + cfg::RECONNECT_INTERVAL_MS);
  LOGF("wifi", "connecting to saved network… (next try in %lu s if this fails)",
       (unsigned long)(wait / 1000));
}

// ---------- Time ----------

uint64_t epochMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return static_cast<uint64_t>(tv.tv_sec) * 1000ULL + tv.tv_usec / 1000;
}

// ---------- MQTT ----------

WiFiClient tcp;
PubSubClient mqtt(tcp);
char host[65];
uint16_t port = 0;
char deviceId[33];
char clientId[48];
char topicTelemetry[96];
char topicStatus[96];
char topicCommand[96];
uint32_t netVersion = UINT32_MAX;
Retry mqttRetry;
bool mqttWasUp = false;
uint32_t lastPublish = 0;

void configureMqtt() {
  Settings s = settings::get();
  strncpy(host, s.mqttHost, sizeof(host) - 1);
  port = s.mqttPort;
  strncpy(deviceId, s.deviceId, sizeof(deviceId) - 1);
  uint8_t mac[6];
  WiFi.macAddress(mac);
  snprintf(clientId, sizeof(clientId), "%s-%02x%02x%02x", deviceId, mac[3], mac[4], mac[5]);
  snprintf(topicTelemetry, sizeof(topicTelemetry), cfg::TOPIC_TELEMETRY, deviceId);
  snprintf(topicStatus, sizeof(topicStatus), cfg::TOPIC_STATUS, deviceId);
  snprintf(topicCommand, sizeof(topicCommand), cfg::TOPIC_COMMAND, deviceId);
  mqtt.setServer(host, port);  // PubSubClient keeps the pointer: `host` is static
  netVersion = settings::networkVersion();
}

void onMessage(char* topic, uint8_t* payload, unsigned int length) {
  if (strcmp(topic, topicCommand) != 0) return;
  Command c{};
  if (!commands::parseMqtt(payload, length, c)) return;  // malformed / stale / invalid: logged
  if (!shared::postCommand(c)) LOGF("cmd", "queue full, command dropped");
}

void publishTelemetry(uint32_t now) {
  Snapshot snap = shared::snapshot();
  Settings s = settings::get();
  JsonDocument doc;
  if (commands::clockIsSet()) doc["ts"] = epochMs();
  doc["intervalSec"] = cfg::TELEMETRY_INTERVAL_MS / 1000;
  doc["uptimeSec"] = static_cast<uint32_t>(esp_timer_get_time() / 1000000);  // no 49-day wrap
  auto num = [&](const char* key, bool ok, float v, unsigned decimals) {
    if (ok) doc[key] = serialized(String(v, decimals));
    else doc[key] = nullptr;  // contract: null = sensor read failed
  };
  num("airTemp", snap.airOk, snap.airTemp, 1);
  num("humidity", snap.airOk, snap.humidity, 1);
  num("soilMoisture", snap.soilPctOk, snap.soilPct, 1);
  if (snap.soilRawOk) doc["soilRaw"] = snap.soilMv;
  else doc["soilRaw"] = nullptr;
  num("lux", snap.luxOk, snap.lux, 1);
  doc["fanOn"] = snap.fanOn;
  doc["fanMode"] = fanModeName(snap.fanMode);
  doc["rssi"] = WiFi.RSSI();
  doc["fanOnTemp"] = serialized(String(s.fanOnTemp, 1));
  doc["fanOffTemp"] = serialized(String(s.fanOffTemp, 1));
  doc["soilDryMv"] = s.soilDryMv;
  doc["soilWetMv"] = s.soilWetMv;
  if (snap.errors) {
    JsonArray errors = doc["errors"].to<JsonArray>();
    if (snap.errors & ERR_DHT) errors.add("dht");
    if (snap.errors & ERR_BH1750) errors.add("bh1750");
    if (snap.errors & ERR_SOIL) errors.add("soil");
    if (snap.errors & ERR_SOIL_CAL) errors.add("soil_cal");
  }
  char buf[cfg::MQTT_BUFFER_SIZE - 64];  // leave room for the topic + MQTT header
  size_t n = serializeJson(doc, buf, sizeof(buf));
  bool ok = mqtt.publish(topicTelemetry, reinterpret_cast<const uint8_t*>(buf), n, false);
  lastPublish = now;
  if (!ok || n == 0) LOGF("mqtt", "telemetry publish failed (%u bytes)", static_cast<unsigned>(n));
}

void maintainMqtt(uint32_t now) {
  if (settings::networkVersion() != netVersion) {
    if (mqtt.connected()) {
      mqtt.publish(topicStatus, "offline", true);
      mqtt.disconnect();
      LOGF("mqtt", "settings changed, reconnecting");
    }
    configureMqtt();
    mqttRetry.asap();
  }

  bool up = mqtt.connected();
  if (up != mqttWasUp) {
    mqttWasUp = up;
    if (!up) {
      LOGF("mqtt", "connection lost (state %d); reconnecting every %lu s", mqtt.state(),
           (unsigned long)(cfg::RECONNECT_INTERVAL_MS / 1000));
      mqttRetry.asap();
    }
  }
  if (up) return;
  if (!mqttRetry.due(now)) return;

  LOGF("mqtt", "connecting to %s:%u as %s …", host, port, clientId);
  // Last Will: the broker publishes retained "offline" if we vanish (contract §4).
  bool ok = mqtt.connect(clientId, nullptr, nullptr, topicStatus, 1, true, "offline", true);
  if (ok) {
    mqttWasUp = true;
    mqtt.publish(topicStatus, "online", true);  // retained
    mqtt.subscribe(topicCommand, 1);
    LOGF("mqtt", "connected; subscribed to %s", topicCommand);
    shared::requestTelemetry();  // first telemetry right away
  } else {
    // Measured from the end of this attempt: connect() itself can block ~3 s here (core 0 only).
    uint32_t wait = mqttRetry.after(millis(), cfg::RECONNECT_INTERVAL_MS);
    LOGF("mqtt", "connect failed (state %d: %s); retry in %lu s", mqtt.state(),
         mqtt.state() == -2 ? "broker unreachable: IP/port/firewall?" : "see PubSubClient states",
         (unsigned long)(wait / 1000));
  }
}

void task(void*) {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // lower latency for commands; mains-powered anyway
  WiFi.setHostname(settings::get().deviceId);
  configureMqtt();

  for (;;) {
    uint32_t now = millis();

    if (shared::takePortalRequest() && !portalOpen) openPortal();

    if (portalOpen) {
      wm.process();
      if (!wm.getConfigPortalActive()) closedPortal();
    } else {
      maintainWifi(now);
    }

    if (WiFi.status() == WL_CONNECTED) {
      maintainMqtt(now);
      if (mqtt.connected()) {
        mqtt.loop();
        bool requested = shared::takeTelemetryRequest();
        if ((requested && now - lastPublish >= 250) || now - lastPublish >= cfg::TELEMETRY_INTERVAL_MS) {
          publishTelemetry(now);
        } else if (requested) {
          shared::requestTelemetry();  // keep it for the next pass
        }
      }
    } else if (mqttWasUp) {
      mqttWasUp = false;
      LOGF("mqtt", "offline (no Wi-Fi)");
    }

    if (!portalOpen) {
      setState(WiFi.status() != WL_CONNECTED ? State::NoWifi
               : mqtt.connected()            ? State::Online
                                             : State::NoMqtt);
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

}  // namespace

void begin() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  snprintf(apName, sizeof(apName), "%s-%02X%02X", cfg::PORTAL_AP_PREFIX, mac[4], mac[5]);

  wm.setDebugOutput(false);
  wm.setConfigPortalBlocking(false);  // portal runs inside our loop (wm.process())
  wm.setConfigPortalTimeout(cfg::PORTAL_TIMEOUT_S);
  wm.setConnectTimeout(15);
  wm.setBreakAfterConfig(true);       // keep the MQTT settings even if Wi-Fi fails
  wm.setParamsPage(true);             // "Setup" page: change broker IP without retyping Wi-Fi
  wm.setTitle("Smart Greenhouse");
  wm.addParameter(&pHeader);
  wm.addParameter(&pHost);
  wm.addParameter(&pPort);
  wm.addParameter(&pDeviceId);
  wm.addParameter(&pActiveLow);
  wm.setSaveParamsCallback(onSaveParams);

  mqtt.setCallback(onMessage);
  mqtt.setBufferSize(cfg::MQTT_BUFFER_SIZE);
  mqtt.setKeepAlive(15);
  mqtt.setSocketTimeout(5);

  // Core 0 (with the Wi-Fi stack); loop() and the fan logic run on core 1.
  xTaskCreatePinnedToCore(task, "net", 10240, nullptr, 1, nullptr, 0);
}

State state() { return static_cast<State>(currentState.load()); }

const char* stateName(State s) {
  switch (s) {
    case State::Portal:
      return "setup portal open";
    case State::NoWifi:
      return "no Wi-Fi";
    case State::NoMqtt:
      return "Wi-Fi ok, no MQTT";
    case State::Online:
      return "online";
  }
  return "?";
}

}  // namespace net
