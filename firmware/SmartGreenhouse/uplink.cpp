#include "uplink.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <sys/time.h>
#include <time.h>

#include <atomic>

#include "commands.h"
#include "config.h"
#include "log.h"
#include "settings.h"
#include "shared.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "secrets.h is missing: copy secrets.example.h to secrets.h and fill in Wi-Fi, server URL and device key (docs/firmware.md)"
#endif

namespace uplink {
namespace {

std::atomic<uint8_t> currentState{static_cast<uint8_t>(State::NoWifi)};
void setState(State s) { currentState = static_cast<uint8_t>(s); }

// The last POST, for the console's "status" (written by this task only).
std::atomic<int> lastStatus{0};  // HTTP status, or a negative HTTPClient error (0 = none yet)
std::atomic<uint32_t> lastAttemptAt{0};
std::atomic<uint32_t> lastOkAt{0};
std::atomic<uint32_t> postsOk{0};
std::atomic<uint32_t> postsFailed{0};

WiFiClientSecure tls;
String readingsUrl;
bool wifiWasUp = false;
uint32_t nextWifiAttempt = 0;
uint32_t nextPostAt = 0;

bool due(uint32_t now, uint32_t at) { return static_cast<int32_t>(now - at) >= 0; }

uint64_t epochMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return static_cast<uint64_t>(tv.tv_sec) * 1000ULL + tv.tv_usec / 1000;
}

// ---------- Wi-Fi: the driver reconnects by itself; this re-joins if it gives up ----------

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
      nextPostAt = now;  // first reading right away
    } else {
      LOGF("wifi", "disconnected; reconnecting (sensor reading unaffected)");
      nextWifiAttempt = now + cfg::WIFI_RETRY_MS;  // auto-reconnect gets the first chance
    }
  }
  if (!up && due(now, nextWifiAttempt)) joinWifi(now);
}

// ---------- One reading → POST /api/readings ----------

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

/** Commands queued by the backend arrive in the 201 response: {"reading":…,"commands":[…]}. */
void handleAnswer(const String& answer) {
  JsonDocument doc;
  if (deserializeJson(doc, answer) != DeserializationError::Ok) {
    LOGF("http", "answer is not JSON (%u bytes); commands skipped", answer.length());
    return;
  }
  for (JsonObjectConst cmd : doc["commands"].as<JsonArrayConst>()) {
    Command c{};
    if (commands::parse(cmd, c) && !shared::postCommand(c)) LOGF("cmd", "queue full, command dropped");
  }
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

void postReading(uint32_t now) {
  JsonDocument doc;
  buildReading(doc);
  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.setConnectTimeout(cfg::HTTP_TIMEOUT_MS);
  http.setTimeout(cfg::HTTP_TIMEOUT_MS);
  http.setReuse(false);  // one short connection per reading
  lastAttemptAt = now;
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
  lastStatus = status;

  if (status == 201) {
    postsOk++;
    lastOkAt = millis();
    nextPostAt = now + cfg::READING_INTERVAL_MS;
    setState(State::Online);
    handleAnswer(answer);
  } else {
    postsFailed++;
    nextPostAt = now + cfg::RETRY_AFTER_FAILURE_MS;
    setState(State::NoServer);
    explainFailure(status, answer);
  }
}

void task(void*) {
  readingsUrl = String(SERVER_URL) + "/api/readings";

  // TLS without verifying the server's certificate: the connection is encrypted,
  // but an attacker on the network could impersonate the server. To verify it
  // (recommended beyond a class demo), pin the root CA of the server's chain:
  //
  //   static const char ROOT_CA[] PROGMEM = R"PEM(
  //   -----BEGIN CERTIFICATE-----
  //   ...the root certificate, Base-64...
  //   -----END CERTIFICATE-----
  //   )PEM";
  //   tls.setCACert(ROOT_CA);   // instead of tls.setInsecure()
  //
  // Get it from a browser: open SERVER_URL → padlock → certificate → the top
  // (root) of the chain → export as Base-64/PEM. Roots last for years, but if the
  // host switches CAs, posting fails with a TLS error until you update it.
  tls.setInsecure();
  tls.setHandshakeTimeout(cfg::HTTP_TIMEOUT_MS / 1000);  // seconds

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // mains-powered: lower latency
  WiFi.setHostname(settings::get().deviceId);
  WiFi.setAutoReconnect(true);
  joinWifi(millis());

  for (;;) {
    uint32_t now = millis();
    maintainWifi(now);

    if (WiFi.status() == WL_CONNECTED) {
      // A change (e.g. calibration) is reported at once, at most once per second.
      bool requested = shared::takeReadingRequest();
      if (due(now, nextPostAt) || (requested && now - lastAttemptAt >= 1000)) {
        postReading(now);
      } else if (requested) {
        shared::requestReading();  // keep it for the next pass
      }
    } else {
      setState(State::NoWifi);
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

}  // namespace

void begin() {
  // Core 0 (with the Wi-Fi stack); loop() and the sensor reading run on core 1.
  // TLS needs a large stack.
  xTaskCreatePinnedToCore(task, "uplink", 16384, nullptr, 1, nullptr, 0);
}

State state() { return static_cast<State>(currentState.load()); }

const char* stateName(State s) {
  switch (s) {
    case State::NoWifi:
      return "no Wi-Fi";
    case State::NoServer:
      return "Wi-Fi ok, server not reached";
    case State::Online:
      return "online";
  }
  return "?";
}

void printStatus() {
  uint32_t now = millis();
  LOGF("status", "uplink: %s; Wi-Fi \"%s\" IP %s RSSI %d", stateName(state()), WIFI_SSID,
       WiFi.localIP().toString().c_str(), WiFi.RSSI());
  LOGF("status", "server: %s/api/readings; posts ok %lu, failed %lu", SERVER_URL,
       (unsigned long)postsOk.load(), (unsigned long)postsFailed.load());
  uint32_t attempt = lastAttemptAt.load();
  if (attempt == 0) {
    LOGF("status", "no reading sent yet");
  } else {
    int status = lastStatus.load();
    LOGF("status", "last POST %lu s ago: %s%d", (unsigned long)((now - attempt) / 1000),
         status < 0 ? "error " : "HTTP ", status);
  }
  if (lastOkAt.load() != 0) {
    LOGF("status", "last accepted %lu s ago", (unsigned long)((now - lastOkAt.load()) / 1000));
  }
}

}  // namespace uplink
