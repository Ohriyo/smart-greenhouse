#include "uplink.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <sys/time.h>
#include <time.h>

#include <atomic>

#include "commands.h"
#include "config.h"
#include "log.h"
#include "mqtt_ca.h"
#include "settings.h"
#include "shared.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "secrets.h is missing: copy secrets.example.h to secrets.h and fill in Wi-Fi, MQTT, server URL and device key (docs/firmware.md)"
#endif

// A secrets.h from before MQTT came back still builds: HTTPS only, with a reminder.
#ifndef MQTT_HOST
#pragma message("secrets.h has no MQTT_HOST: readings go over HTTPS only. See secrets.example.h.")
#define MQTT_HOST ""
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 8883
#endif
#ifndef MQTT_USERNAME
#define MQTT_USERNAME ""
#endif
#ifndef MQTT_PASSWORD
#define MQTT_PASSWORD ""
#endif

namespace uplink {
namespace {

std::atomic<uint8_t> currentState{static_cast<uint8_t>(State::NoWifi)};
void setState(State s) { currentState = static_cast<uint8_t>(s); }

bool due(uint32_t now, uint32_t at) { return static_cast<int32_t>(now - at) >= 0; }

uint64_t epochMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return static_cast<uint64_t>(tv.tv_sec) * 1000ULL + tv.tv_usec / 1000;
}

// Counters for the console's "status" (written by this task only).
std::atomic<uint32_t> mqttSent{0};
std::atomic<uint32_t> mqttConnects{0};
std::atomic<int> mqttLastState{0};  // PubSubClient state of the last failed connect (0 = none)
std::atomic<int> lastHttpStatus{0};  // HTTP status, or a negative HTTPClient error (0 = none yet)
std::atomic<uint32_t> lastHttpAttemptAt{0};
std::atomic<uint32_t> httpsOk{0};
std::atomic<uint32_t> httpsFailed{0};
std::atomic<uint32_t> lastPingAt{0};
std::atomic<int> lastPingStatus{0};

// ---------- Wi-Fi: the driver reconnects by itself; this re-joins if it gives up ----------

bool wifiWasUp = false;
uint32_t nextWifiAttempt = 0;
uint32_t nextReadingAt = 0;
uint32_t lastReadingAt = 0;
uint32_t nextMqttAttempt = 0;
uint32_t mqttBackoffMs = cfg::MQTT_RETRY_MIN_MS;

void joinWifi(uint32_t now) {
  LOGF("wifi", "connecting to \"%s\"…", WIFI_SSID);
  WiFi.disconnect(false, false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  nextWifiAttempt = now + cfg::WIFI_RETRY_MS;
}

void maintainWifi(uint32_t now) {
  bool up = WiFi.status() == WL_CONNECTED;
  if (up != wifiWasUp) {
    wifiWasUp = up;
    if (up) {
      LOGF("wifi", "connected to \"%s\", IP %s, RSSI %d dBm", WiFi.SSID().c_str(),
           WiFi.localIP().toString().c_str(), WiFi.RSSI());
      configTime(0, 0, "pool.ntp.org", "time.google.com");  // UTC; non-blocking SNTP
      nextMqttAttempt = now;  // MQTT first ...
      nextReadingAt = now;    // ... then the first reading right away
    } else {
      LOGF("wifi", "disconnected; reconnecting (sensor reading unaffected)");
      nextWifiAttempt = now + cfg::WIFI_RETRY_MS;  // auto-reconnect gets the first chance
    }
  }
  if (!up && due(now, nextWifiAttempt)) joinWifi(now);
}

// ---------- One reading as JSON (the same body for MQTT and HTTPS, contract §2) ----------

void buildReading(JsonDocument& doc) {
  Snapshot snap = shared::snapshot();
  Settings s = settings::get();
  doc["deviceId"] = s.deviceId;
  // A failed sensor is sent as null (contract §2), never as a made-up number.
  auto num = [&](const char* key, bool ok, float v, unsigned decimals) {
    if (ok && !isnan(v)) doc[key] = serialized(String(v, decimals));
    else doc[key] = nullptr;
  };
  num("temperature", snap.airOk, snap.airTemp, 1);
  num("humidity", snap.airOk, snap.humidity, 1);
  num("soilMoisture", snap.soilPctOk, snap.soilPct, 1);
  num("lux", snap.luxOk, snap.lux, 1);
  if (snap.soilRawOk) doc["soilRaw"] = snap.soilMv;
  else doc["soilRaw"] = nullptr;
  doc["rssi"] = WiFi.RSSI();
  doc["intervalSec"] = cfg::READING_INTERVAL_MS / 1000;
  doc["uptimeSec"] = static_cast<uint32_t>(esp_timer_get_time() / 1000000);  // no 49-day wrap
  doc["soilDryMv"] = s.soilDryMv;
  doc["soilWetMv"] = s.soilWetMv;
  if (commands::clockIsSet()) doc["ts"] = epochMs();
  if (snap.errors) {
    JsonArray errors = doc["errors"].to<JsonArray>();
    if (snap.errors & ERR_DHT) errors.add("dht");
    if (snap.errors & ERR_BH1750) errors.add("bh1750");
    if (snap.errors & ERR_SOIL) errors.add("soil");
    if (snap.errors & ERR_SOIL_CAL) errors.add("soil_cal");
  }
}

/** One command object (from MQTT or the HTTPS answer) → the control loop's queue. */
void queueCommand(JsonObjectConst cmd) {
  Command c{};
  if (commands::parse(cmd, c) && !shared::postCommand(c)) LOGF("cmd", "queue full, command dropped");
}

// ---------- MQTT ----------

const bool mqttEnabled = MQTT_HOST[0] != '\0';
const bool mqttUsesTls = MQTT_PORT != 1883;  // 1883 = plain TCP (a local test broker only)

WiFiClientSecure mqttTls;
WiFiClient mqttTcp;
PubSubClient mqtt;
char clientId[48];
char topicTelemetry[96];
char topicStatus[96];
char topicCommand[96];
bool mqttWasUp = false;

void onMqttMessage(char* topic, uint8_t* payload, unsigned int length) {
  if (strcmp(topic, topicCommand) != 0) return;
  JsonDocument doc;
  if (deserializeJson(doc, payload, length) != DeserializationError::Ok || !doc.is<JsonObject>()) {
    LOGF("cmd", "ignored a command that is not a JSON object (%u bytes)", length);
    return;
  }
  queueCommand(doc.as<JsonObjectConst>());
}

const char* explainMqttState(int state) {
  switch (state) {
    case MQTT_CONNECTION_TIMEOUT:
      return "no answer from the broker";
    case MQTT_CONNECT_FAILED:
      return "TCP/TLS connection failed: wrong MQTT_HOST/MQTT_PORT, port 8883 blocked on this Wi-Fi, or TLS";
    case MQTT_CONNECT_BAD_CREDENTIALS:
    case MQTT_CONNECT_UNAUTHORIZED:
      return "login refused: check MQTT_USERNAME / MQTT_PASSWORD in secrets.h and EMQX → Authentication";
    case MQTT_CONNECT_UNAVAILABLE:
      return "broker unavailable";
    case MQTT_CONNECT_BAD_CLIENT_ID:
      return "client id refused";
    default:
      return "see PubSubClient states";
  }
}

void connectMqtt() {
  LOGF("mqtt", "connecting to %s:%u as %s …", MQTT_HOST, MQTT_PORT, clientId);
  const char* user = MQTT_USERNAME[0] ? MQTT_USERNAME : nullptr;
  const char* pass = MQTT_PASSWORD[0] ? MQTT_PASSWORD : nullptr;
  // Last Will: if the connection dies without a goodbye, the broker publishes a
  // retained "offline" on our status topic (contract §4).
  bool ok = mqtt.connect(clientId, user, pass, topicStatus, 1, true, "offline", true);
  if (ok) {
    mqttConnects++;
    mqttBackoffMs = cfg::MQTT_RETRY_MIN_MS;
    mqttLastState = 0;
    mqtt.publish(topicStatus, "online", true);  // retained
    mqtt.subscribe(topicCommand, 1);
    mqttWasUp = true;
    LOGF("mqtt", "connected; readings go to %s, commands from %s", topicTelemetry, topicCommand);
    nextReadingAt = millis();  // a reading right away over MQTT
    return;
  }
  int state = mqtt.state();
  mqttLastState = state;
  char tlsError[96] = "";
  if (mqttUsesTls && state == MQTT_CONNECT_FAILED && mqttTls.lastError(tlsError, sizeof(tlsError)) == 0) {
    tlsError[0] = '\0';
  }
  // Measured from the end of this attempt: connect() itself can block ~10 s (core 0 only).
  nextMqttAttempt = millis() + mqttBackoffMs;
  LOGF("mqtt", "connect failed (state %d: %s%s%s); HTTPS meanwhile, retry in %lu s", state,
       explainMqttState(state), tlsError[0] ? "; TLS: " : "", tlsError,
       (unsigned long)(mqttBackoffMs / 1000));
  mqttBackoffMs = min(mqttBackoffMs * 2, cfg::MQTT_RETRY_MAX_MS);
}

void maintainMqtt(uint32_t now) {
  if (!mqttEnabled) return;
  bool up = mqtt.connected();
  if (mqttWasUp && !up) {
    mqttWasUp = false;
    LOGF("mqtt", "connection lost (state %d); readings go over HTTPS until it is back", mqtt.state());
    nextMqttAttempt = now + cfg::MQTT_RETRY_MIN_MS / 5;  // first retry after 2 s
    mqttBackoffMs = cfg::MQTT_RETRY_MIN_MS;
  }
  if (up) {
    mqtt.loop();  // incoming commands and keep-alive
  } else if (due(now, nextMqttAttempt)) {
    connectMqtt();
  }
}

/** True if the reading was handed to the broker (QoS 0: PubSubClient's only option). */
bool publishReading() {
  if (!mqtt.connected()) return false;
  JsonDocument doc;
  buildReading(doc);
  char buf[cfg::MQTT_BUFFER_SIZE - 128];  // room for the topic + MQTT header
  size_t n = serializeJson(doc, buf, sizeof(buf));
  bool ok = n > 0 && n < sizeof(buf) - 1 &&
            mqtt.publish(topicTelemetry, reinterpret_cast<const uint8_t*>(buf), n, false);
  if (ok) mqttSent++;
  else LOGF("mqtt", "publish failed (%u bytes): sending this reading over HTTPS", (unsigned)n);
  return ok;
}

// ---------- HTTPS: POST /api/readings (fallback) and GET /health (keep-awake) ----------

WiFiClientSecure tls;
String readingsUrl;
String healthUrl;
bool lastHttpsPostOk = false;
uint32_t nextPingAt = 0;

/** Commands queued by the backend arrive in the 201 response: {"reading":…,"commands":[…]}. */
void handleAnswer(const String& answer) {
  JsonDocument doc;
  if (deserializeJson(doc, answer) != DeserializationError::Ok) {
    LOGF("http", "answer is not JSON (%u bytes); commands skipped", answer.length());
    return;
  }
  for (JsonObjectConst cmd : doc["commands"].as<JsonArrayConst>()) queueCommand(cmd);
}

void explainFailure(int status, const String& answer) {
  if (status < 0) {
    LOGF("http", "POST failed: %s (server asleep or unreachable? next try in %lu s)",
         HTTPClient::errorToString(status).c_str(),
         (unsigned long)(cfg::RETRY_AFTER_FAILURE_MS / 1000));
  } else if (status == 401) {
    LOGF("http", "401: wrong device key. DEVICE_KEY in secrets.h must equal DEVICE_API_KEY on the server");
  } else if (status == 400) {
    LOGF("http", "400: the server rejected the reading: %.200s", answer.c_str());
  } else {
    LOGF("http", "HTTP %d: %.200s", status, answer.c_str());
  }
}

/** Returns true when the backend stored the reading (HTTP 201). */
bool postReading(uint32_t now) {
  JsonDocument doc;
  buildReading(doc);
  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.setConnectTimeout(cfg::HTTP_TIMEOUT_MS);
  http.setTimeout(cfg::HTTP_TIMEOUT_MS);
  http.setReuse(false);  // one short connection per reading
  lastHttpAttemptAt = now;
  int status;
  String answer;
  if (!http.begin(tls, readingsUrl)) {
    status = HTTPC_ERROR_CONNECTION_REFUSED;
    LOGF("http", "invalid SERVER_URL \"%s\" in secrets.h", SERVER_URL);
  } else {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Key", DEVICE_KEY);
    status = http.POST(body);
    if (status > 0) answer = http.getString();
    http.end();
  }
  lastHttpStatus = status;
  lastHttpsPostOk = status == 201;
  if (status == 201) {
    httpsOk++;
    nextPingAt = millis() + cfg::KEEP_AWAKE_MS;  // this request kept the server awake too
    handleAnswer(answer);
    return true;
  }
  httpsFailed++;
  explainFailure(status, answer);
  return false;
}

/** GET /health: wakes a sleeping Render service and keeps it awake (any answer counts). */
void pingHealth() {
  HTTPClient http;
  // Shorter than a reading's timeouts: this blocks MQTT's keep-alive meanwhile.
  http.setConnectTimeout(8000);
  http.setTimeout(8000);
  http.setReuse(false);
  int status = HTTPC_ERROR_CONNECTION_REFUSED;
  if (http.begin(tls, healthUrl)) {
    status = http.GET();
    http.end();
  }
  lastPingAt = millis();
  lastPingStatus = status;
  if (status == 200) {
    nextPingAt = millis() + cfg::KEEP_AWAKE_MS;
  } else {
    // A cold start takes ~1 min: the failed request still woke it; check again soon.
    nextPingAt = millis() + cfg::KEEP_AWAKE_RETRY_MS;
    LOGF("http", "keep-awake GET /health: %s%d (server waking up?), again in %lu s",
         status < 0 ? "error " : "HTTP ", status, (unsigned long)(cfg::KEEP_AWAKE_RETRY_MS / 1000));
  }
}

// ---------- The task ----------

void sendReading(uint32_t now) {
  lastReadingAt = now;
  if (publishReading()) {
    nextReadingAt = now + cfg::READING_INTERVAL_MS;
    return;
  }
  // MQTT down (or the publish failed): the same reading over HTTPS.
  bool ok = postReading(now);
  nextReadingAt = now + (ok ? cfg::READING_INTERVAL_MS : cfg::RETRY_AFTER_FAILURE_MS);
}

void updateState() {
  if (WiFi.status() != WL_CONNECTED) setState(State::NoWifi);
  else if (mqtt.connected()) setState(State::Online);
  else if (lastHttpsPostOk) setState(State::OnlineHttps);
  else setState(State::NoServer);
}

void task(void*) {
  readingsUrl = String(SERVER_URL) + "/api/readings";
  healthUrl = String(SERVER_URL) + "/health";

  // HTTPS to the backend: encrypted, but the server's certificate is not verified, so
  // an attacker on the network could impersonate it. To verify it (recommended beyond
  // a class demo), pin the root CA of the server's chain, like MQTT does below:
  //   tls.setCACert(ROOT_CA_OF_RENDER);   // instead of tls.setInsecure()
  // Get it from a browser: open SERVER_URL → padlock → certificate → the top (root) of
  // the chain → export as Base-64/PEM.
  tls.setInsecure();
  tls.setHandshakeTimeout(cfg::HTTP_TIMEOUT_MS / 1000);  // seconds

  // MQTT over TLS: the broker's certificate IS verified (mqtt_ca.h), so the MQTT
  // password only ever goes to the real EMQX.
#if defined(MQTT_TLS_INSECURE) && MQTT_TLS_INSECURE
  mqttTls.setInsecure();
#else
  mqttTls.setCACert(MQTT_ROOT_CA);
#endif
  mqttTls.setHandshakeTimeout(cfg::MQTT_SOCKET_TIMEOUT_S);
  Settings s = settings::get();
  uint8_t mac[6];
  WiFi.macAddress(mac);
  snprintf(clientId, sizeof(clientId), "%s-%02x%02x%02x", s.deviceId, mac[3], mac[4], mac[5]);
  snprintf(topicTelemetry, sizeof(topicTelemetry), cfg::TOPIC_TELEMETRY, s.deviceId);
  snprintf(topicStatus, sizeof(topicStatus), cfg::TOPIC_STATUS, s.deviceId);
  snprintf(topicCommand, sizeof(topicCommand), cfg::TOPIC_COMMAND, s.deviceId);
  if (mqttUsesTls) mqtt.setClient(mqttTls);
  else mqtt.setClient(mqttTcp);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  if (!mqtt.setBufferSize(cfg::MQTT_BUFFER_SIZE)) LOGF("mqtt", "no memory for the MQTT buffer");
  mqtt.setKeepAlive(cfg::MQTT_KEEPALIVE_S);
  mqtt.setSocketTimeout(cfg::MQTT_SOCKET_TIMEOUT_S);
  if (!mqttEnabled) LOGF("mqtt", "MQTT_HOST is empty in secrets.h: readings go over HTTPS only");

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // mains-powered: lower latency (commands arrive at once)
  WiFi.setHostname(s.deviceId);
  WiFi.setAutoReconnect(true);
  joinWifi(millis());

  for (;;) {
    uint32_t now = millis();
    maintainWifi(now);

    if (WiFi.status() == WL_CONNECTED) {
      maintainMqtt(now);
      now = millis();  // a connect attempt may have taken a while
      // A change (e.g. calibration) is reported at once, at most once per second.
      bool requested = shared::takeReadingRequest();
      if (due(now, nextReadingAt) || (requested && now - lastReadingAt >= 1000)) {
        sendReading(now);
      } else if (requested) {
        shared::requestReading();  // keep it for the next pass
      }
      // Only needed while on MQTT: HTTPS readings reach the server anyway.
      if (mqtt.connected() && due(millis(), nextPingAt)) pingHealth();
    }
    updateState();
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

}  // namespace

void begin() {
  // Core 0 (with the Wi-Fi stack); loop() and the sensor reading run on core 1.
  // Two TLS connections (MQTT + an HTTPS request) need a large stack.
  xTaskCreatePinnedToCore(task, "uplink", 20480, nullptr, 1, nullptr, 0);
}

State state() { return static_cast<State>(currentState.load()); }

const char* stateName(State s) {
  switch (s) {
    case State::NoWifi:
      return "no Wi-Fi";
    case State::NoServer:
      return "Wi-Fi ok, neither MQTT nor HTTPS reached";
    case State::OnlineHttps:
      return "online over HTTPS (MQTT fallback)";
    case State::Online:
      return "online over MQTT";
  }
  return "?";
}

void printStatus() {
  uint32_t now = millis();
  LOGF("status", "uplink: %s; Wi-Fi \"%s\" IP %s RSSI %d; free heap %lu", stateName(state()),
       WIFI_SSID, WiFi.localIP().toString().c_str(), WiFi.RSSI(),
       (unsigned long)ESP.getFreeHeap());
  if (mqttEnabled) {
    LOGF("status", "mqtt: %s:%u (%s) %s; sent %lu, connects %lu", MQTT_HOST, MQTT_PORT,
         mqttUsesTls ? "TLS" : "plain", mqtt.connected() ? "connected" : "not connected",
         (unsigned long)mqttSent.load(), (unsigned long)mqttConnects.load());
    if (!mqtt.connected() && mqttLastState.load() != 0) {
      LOGF("status", "mqtt: last connect failed: %s", explainMqttState(mqttLastState.load()));
    }
  } else {
    LOGF("status", "mqtt: off (MQTT_HOST empty)");
  }
  LOGF("status", "https: %s; readings ok %lu, failed %lu", SERVER_URL,
       (unsigned long)httpsOk.load(), (unsigned long)httpsFailed.load());
  uint32_t attempt = lastHttpAttemptAt.load();
  if (attempt != 0) {
    int status = lastHttpStatus.load();
    LOGF("status", "last HTTPS reading %lu s ago: %s%d", (unsigned long)((now - attempt) / 1000),
         status < 0 ? "error " : "HTTP ", status);
  }
  if (lastPingAt.load() != 0) {
    LOGF("status", "keep-awake GET /health %lu s ago: %d", (unsigned long)((now - lastPingAt.load()) / 1000),
         lastPingStatus.load());
  }
}

}  // namespace uplink
