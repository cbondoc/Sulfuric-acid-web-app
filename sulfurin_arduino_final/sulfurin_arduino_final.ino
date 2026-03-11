// === RELAY SEQUENCE + SUPABASE (Arduino R4 WiFi) ===
// Wiring and sequence: Acid → Water → Mixer → Rest (x2). Logs each step to Supabase.
//
// --- Relay Mapping ---
// A0 → Relay 1 → Mixer (220V)
// A1 → Relay 2 → Container Rest
// A2 → Relay 3 → Container Acid
// A3 → Relay 4 → Container Water
//
// 1. Set WIFI_SSID, WIFI_PASS, SUPABASE_HOST, SUPABASE_API_KEY below.
// 2. Run supabase/schema.sql in your Supabase project.
// 3. Board: Arduino Uno R4 WiFi. Upload and open Serial Monitor (115200).

#include <WiFiS3.h>

/* ==================== WIFI / SUPABASE ==================== */
const char* WIFI_SSID     = "bondoc_sala";
const char* WIFI_PASS     = "carybondoc1234";
const char SUPABASE_HOST[] = "ijarxjhzseyfqmjqjoul.supabase.co";
const char SUPABASE_API_KEY[] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqYXJ4amh6c2V5ZnFtanFqb3VsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUwMDQ3NywiZXhwIjoyMDg3MDc2NDc3fQ.M38PRrrqJQnhhfWiXj0Uzcxr8m8aZjvgvQTLwg3rzYA";
const char SUPABASE_RELAY_LOGS_PATH[] = "/rest/v1/relay_logs";
const char SUPABASE_SETTINGS_PATH[]  = "/rest/v1/device_settings";
const char SUPABASE_STATE_PATH[]     = "/rest/v1/device_state";

const char DEVICE_ID[] = "arduino_r4_1";

WiFiSSLClient sslClient;

/* ==================== RELAY ==================== */
int mixerDuration      = 10000;   // Relay 1 (Mixer)
int containerRestTime  = 110000;   // Relay 2 (Container Rest)
int containerAcidTime  = 100000;   // Relay 3 (Container Acid)
int containerWaterTime = 100000;   // Relay 4 (Container Water)
int pauseBetweenRelays = 1000;
int pollIntervalMs     = 1500;    // How often to poll Supabase for Run/Stop

struct RelayStep {
  int pin;
  const char* pinLabel;
  const char* name;
  unsigned long duration;
  int repeat;
};

RelayStep sequence[] = {
  {A2, "A2", "Container Acid",  containerAcidTime, 1},
  {A3, "A3", "Container Water", containerWaterTime, 1},
  {A0, "A0", "Mixer",           mixerDuration,     1},
  {A1, "A1", "Container Rest",  containerRestTime,  2}
};
const int stepCount = sizeof(sequence) / sizeof(sequence[0]);
int cycleNumber = 0;

struct DeviceSettings {
  int cyclesRequested;
  bool runRequested;
  bool stopRequested;
  char runId[80]; // UUID or fallback string
};

char lastHandledRunId[80] = "";

/* ==================== HELPERS ==================== */
void allOff() {
  for (int i = 0; i < stepCount; i++)
    digitalWrite(sequence[i].pin, LOW);
  Serial.println("All relays OFF");
}

bool shouldStop() {
  DeviceSettings s;
  if (!supabaseGetSettings(s)) return false; // treat fetch errors as "no stop" to avoid false trips
  return s.stopRequested;
}

bool shouldStopVerbose(const char* where) {
  Serial.print("[Supabase StopCheck] ");
  Serial.print(where);
  Serial.print(" -> fetching... ");

  DeviceSettings s;
  if (!supabaseGetSettings(s)) {
    Serial.println("FAILED");
    return false;
  }

  Serial.print("ok stop_requested=");
  Serial.println(s.stopRequested ? "true" : "false");
  return s.stopRequested;
}

// Delay in small chunks so we can react quickly to Stop.
bool delayWithStopCheck(const char* where, unsigned long totalMs, unsigned long checkEveryMs = 500) {
  unsigned long start = millis();
  while (millis() - start < totalMs) {
    if (shouldStopVerbose(where)) return false;
    unsigned long remaining = totalMs - (millis() - start);
    unsigned long slice = remaining < checkEveryMs ? remaining : checkEveryMs;
    delay(slice);
  }
  return true;
}

// UUID v4–like string for batch_id (min 37 bytes)
void generateBatchId(char* buf, size_t len) {
  if (len < 37) return;
  const char hex[] = "0123456789abcdef";
  snprintf(buf, len,
           "%c%c%c%c%c%c%c%c-%c%c%c%c-4%c%c%c-%c%c%c%c-%c%c%c%c%c%c%c%c%c%c%c%c",
           hex[random(0, 16)], hex[random(0, 16)], hex[random(0, 16)], hex[random(0, 16)],
           hex[random(0, 16)], hex[random(0, 16)], hex[random(0, 16)], hex[random(0, 16)],
           hex[random(0, 16)], hex[random(0, 16)], hex[random(0, 16)], hex[random(0, 16)],
           hex[random(0, 16)], hex[random(0, 16)], hex[random(0, 16)],
           hex[random(0, 16)], hex[(random(0, 4) + 8) % 16], hex[random(0, 16)], hex[random(0, 16)],
           hex[random(0, 16)], hex[random(0, 16)], hex[random(0, 16)], hex[random(0, 16)],
           hex[random(0, 16)], hex[random(0, 16)], hex[random(0, 16)], hex[random(0, 16)],
           hex[random(0, 16)], hex[random(0, 16)], hex[random(0, 16)], hex[random(0, 16)]);
}

// Escape " and \ for JSON
void escapeJsonString(const char* in, char* out, size_t outLen) {
  size_t j = 0;
  for (size_t i = 0; in[i] && j < outLen - 2; i++) {
    if (in[i] == '"' || in[i] == '\\') out[j++] = '\\';
    if (j < outLen - 1) out[j++] = in[i];
  }
  out[j] = '\0';
}

bool readHttpStatusLine(WiFiSSLClient& c, int& outStatus) {
  unsigned long start = millis();
  while (c.connected() && millis() - start < 10000) {
    if (!c.available()) { delay(10); continue; }
    String line = c.readStringUntil('\n');
    line.trim();
    if (line.startsWith("HTTP/1.1 ")) {
      outStatus = line.substring(9, 12).toInt();
      return true;
    }
  }
  return false;
}

String readHttpBody(WiFiSSLClient& c) {
  unsigned long start = millis();
  bool inBody = false;
  String body = "";
  while (c.connected() && millis() - start < 10000) {
    if (!c.available()) { delay(10); continue; }
    String line = c.readStringUntil('\n');
    if (!inBody) {
      if (line == "\r" || line.length() == 0) inBody = true;
      continue;
    }
    body += line;
  }
  return body;
}

bool jsonFindBool(const String& json, const char* key, bool defaultVal) {
  String needle = String("\"") + key + "\":";
  int idx = json.indexOf(needle);
  if (idx < 0) return defaultVal;
  int v = idx + needle.length();
  while (v < (int)json.length() && json[v] == ' ') v++;
  if (json.startsWith("true", v)) return true;
  if (json.startsWith("false", v)) return false;
  return defaultVal;
}

int jsonFindInt(const String& json, const char* key, int defaultVal) {
  String needle = String("\"") + key + "\":";
  int idx = json.indexOf(needle);
  if (idx < 0) return defaultVal;
  int v = idx + needle.length();
  while (v < (int)json.length() && json[v] == ' ') v++;
  int end = v;
  while (end < (int)json.length() && (json[end] == '-' || (json[end] >= '0' && json[end] <= '9'))) end++;
  return json.substring(v, end).toInt();
}

bool jsonFindString(const String& json, const char* key, char* out, size_t outLen) {
  String needle = String("\"") + key + "\":\"";
  int idx = json.indexOf(needle);
  if (idx < 0) return false;
  int v = idx + needle.length();
  int end = json.indexOf("\"", v);
  if (end < 0) return false;
  String s = json.substring(v, end);
  s.toCharArray(out, outLen);
  return true;
}

bool supabaseGetSettings(DeviceSettings& out) {
  if (WiFi.status() != WL_CONNECTED) return false;

  // Ensure any previous connection is closed before reconnect.
  sslClient.stop();

  if (!sslClient.connect(SUPABASE_HOST, 443)) {
    Serial.println("Supabase TLS connect failed (GET settings)");
    return false;
  }

  String path = String(SUPABASE_SETTINGS_PATH) +
                "?select=device_id,cycles_requested,run_requested,stop_requested,run_id" +
                "&device_id=eq." + DEVICE_ID;

  sslClient.println("GET " + path + " HTTP/1.1");
  sslClient.println("Host: " + String(SUPABASE_HOST));
  sslClient.println("apikey: " + String(SUPABASE_API_KEY));
  sslClient.println("Authorization: Bearer " + String(SUPABASE_API_KEY));
  sslClient.println("Accept: application/json");
  sslClient.println("Connection: close");
  sslClient.println();

  int status = 0;
  if (!readHttpStatusLine(sslClient, status)) {
    sslClient.stop();
    Serial.println("Settings GET: no status line");
    return false;
  }

  String body = readHttpBody(sslClient);
  sslClient.stop();

  if (status < 200 || status >= 300) {
    Serial.print("Settings GET failed: ");
    Serial.print(status);
    Serial.print(" body=");
    Serial.println(body);
    return false;
  }

  out.cyclesRequested = jsonFindInt(body, "cycles_requested", 1);
  if (out.cyclesRequested < 1) out.cyclesRequested = 1;
  out.runRequested = jsonFindBool(body, "run_requested", false);
  out.stopRequested = jsonFindBool(body, "stop_requested", false);
  out.runId[0] = '\0';
  jsonFindString(body, "run_id", out.runId, sizeof(out.runId));
  return true;
}

bool supabasePatchJson(const char* pathWithQuery, const char* jsonBody) {
  if (WiFi.status() != WL_CONNECTED) return false;

  if (!sslClient.connect(SUPABASE_HOST, 443)) {
    Serial.println("Supabase TLS connect failed (PATCH)");
    return false;
  }

  sslClient.println("PATCH " + String(pathWithQuery) + " HTTP/1.1");
  sslClient.println("Host: " + String(SUPABASE_HOST));
  sslClient.println("apikey: " + String(SUPABASE_API_KEY));
  sslClient.println("Authorization: Bearer " + String(SUPABASE_API_KEY));
  sslClient.println("Content-Type: application/json");
  sslClient.println("Prefer: return=minimal");
  sslClient.print("Content-Length: ");
  sslClient.println(strlen(jsonBody));
  sslClient.println("Connection: close");
  sslClient.println();
  sslClient.print(jsonBody);

  int status = 0;
  if (!readHttpStatusLine(sslClient, status)) {
    sslClient.stop();
    Serial.println("PATCH: no status line");
    return false;
  }

  String body = readHttpBody(sslClient);
  sslClient.stop();

  if (status < 200 || status >= 300) {
    Serial.print("PATCH failed: ");
    Serial.print(status);
    Serial.print(" body=");
    Serial.println(body);
    return false;
  }
  return true;
}

void updateDeviceState(const char* status, const char* activeRunId, int cyclesCompleted, const char* lastError) {
  char statusEsc[32], runEsc[96], errEsc[192];
  escapeJsonString(status, statusEsc, sizeof(statusEsc));
  escapeJsonString(activeRunId ? activeRunId : "", runEsc, sizeof(runEsc));
  escapeJsonString(lastError ? lastError : "", errEsc, sizeof(errEsc));

  char body[420];
  if (activeRunId && strlen(activeRunId) > 0) {
    snprintf(body, sizeof(body),
             "{\"status\":\"%s\",\"active_run_id\":\"%s\",\"cycles_completed\":%d,\"last_error\":%s}",
             statusEsc, runEsc, cyclesCompleted,
             (lastError && strlen(lastError) > 0) ? (String("\"") + errEsc + "\"").c_str() : "null");
  } else {
    snprintf(body, sizeof(body),
             "{\"status\":\"%s\",\"active_run_id\":null,\"cycles_completed\":%d,\"last_error\":%s}",
             statusEsc, cyclesCompleted,
             (lastError && strlen(lastError) > 0) ? (String("\"") + errEsc + "\"").c_str() : "null");
  }

  String path = String(SUPABASE_STATE_PATH) + "?device_id=eq." + DEVICE_ID;
  supabasePatchJson(path.c_str(), body);
}

void clearRunCommand() {
  const char* body = "{\"run_requested\":false,\"stop_requested\":false}";
  String path = String(SUPABASE_SETTINGS_PATH) + "?device_id=eq." + DEVICE_ID;
  supabasePatchJson(path.c_str(), body);
}

/* ==================== SUPABASE (R4 WiFi, blocking POST) ==================== */
bool logRelayOnToSupabase(const char* batchId, const char* relayName, const char* relayPin,
                          int sequenceIndex, int cycleNum, unsigned long durationMs) {
  if (WiFi.status() != WL_CONNECTED) return false;

  char nameEsc[128], pinEsc[32];
  escapeJsonString(relayName, nameEsc, sizeof(nameEsc));
  escapeJsonString(relayPin,  pinEsc,  sizeof(pinEsc));

  char body[320];
  snprintf(body, sizeof(body),
           "{\"batch_id\":\"%s\",\"relay_name\":\"%s\",\"relay_pin\":\"%s\","
           "\"sequence_index\":%d,\"cycle_number\":%d,\"duration_ms\":%lu}",
           batchId, nameEsc, pinEsc, sequenceIndex, cycleNum, durationMs);

  if (!sslClient.connect(SUPABASE_HOST, 443)) {
    Serial.println("Supabase TLS connect failed");
    return false;
  }

  sslClient.println("POST " + String(SUPABASE_RELAY_LOGS_PATH) + " HTTP/1.1");
  sslClient.println("Host: " + String(SUPABASE_HOST));
  sslClient.println("apikey: " + String(SUPABASE_API_KEY));
  sslClient.println("Authorization: Bearer " + String(SUPABASE_API_KEY));
  sslClient.println("Content-Type: application/json");
  sslClient.println("Prefer: return=minimal");
  sslClient.print("Content-Length: ");
  sslClient.println(strlen(body));
  sslClient.println("Connection: close");
  sslClient.println();
  sslClient.print(body);

  unsigned long start = millis();
  while (sslClient.connected() && millis() - start < 10000) {
    if (sslClient.available()) {
      String line = sslClient.readStringUntil('\n');
      if (line.startsWith("HTTP/1.1 201") || line.startsWith("HTTP/1.1 200")) {
        while (sslClient.available()) sslClient.read();
        sslClient.stop();
        return true;
      }
      if (line.startsWith("HTTP/1.1 ")) {
        Serial.print("Supabase POST: ");
        Serial.println(line);
        while (sslClient.available()) sslClient.read();
        sslClient.stop();
        return false;
      }
    }
    delay(10);
  }
  sslClient.stop();
  Serial.println("Supabase read timeout");
  return false;
}

void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected.");
}

/* ==================== SETUP ==================== */
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== Relay Sequence + Supabase (R4 WiFi) ===");

  for (int i = 0; i < stepCount; i++) {
    pinMode(sequence[i].pin, OUTPUT);
    digitalWrite(sequence[i].pin, LOW);
  }
  randomSeed(analogRead(A4));  // A4 unconnected for entropy

  connectWiFi();
  delay(500);

  // Supabase settings check on boot
  DeviceSettings s;
  if (supabaseGetSettings(s)) {
    Serial.println("Supabase settings OK:");
    Serial.print("  cycles_requested="); Serial.println(s.cyclesRequested);
    Serial.print("  run_requested="); Serial.println(s.runRequested ? "true" : "false");
    Serial.print("  stop_requested="); Serial.println(s.stopRequested ? "true" : "false");
    Serial.print("  run_id="); Serial.println(s.runId);
  } else {
    Serial.println("Supabase settings check FAILED (will keep retrying).");
  }

  updateDeviceState("idle", "", 0, "");
}

/* ==================== LOOP ==================== */
void loop() {
  DeviceSettings settings;
  if (!supabaseGetSettings(settings)) {
    updateDeviceState("offline", "", 0, "settings_fetch_failed");
    delay(pollIntervalMs);
    return;
  }

  if (!settings.runRequested) {
    updateDeviceState("idle", "", 0, "");
    delay(pollIntervalMs);
    return;
  }

  if (strlen(settings.runId) == 0) {
    Serial.println("Run requested but run_id is empty; ignoring.");
    updateDeviceState("error", "", 0, "run_id_empty");
    delay(pollIntervalMs);
    return;
  }

  if (strcmp(settings.runId, lastHandledRunId) == 0) {
    // Already completed this run_id; wait for a new Run press.
    updateDeviceState("idle", "", 0, "");
    delay(pollIntervalMs);
    return;
  }

  // Start a new run
  strncpy(lastHandledRunId, settings.runId, sizeof(lastHandledRunId));
  lastHandledRunId[sizeof(lastHandledRunId) - 1] = '\0';

  Serial.print("Starting run_id=");
  Serial.print(settings.runId);
  Serial.print(" cycles=");
  Serial.println(settings.cyclesRequested);

  updateDeviceState("running", settings.runId, 0, "");

  int completed = 0;
  bool stoppedEarly = false;
  for (int c = 1; c <= settings.cyclesRequested; c++) {
    // Stop request check before each cycle boundary
    DeviceSettings check;
    if (supabaseGetSettings(check) && check.stopRequested) {
      Serial.println("Stop requested. Stopping now (cycle boundary).");
      updateDeviceState("stopping", settings.runId, completed, "");
      stoppedEarly = true;
      break;
    }

    Serial.print("=== Cycle ");
    Serial.print(c);
    Serial.print("/");
    Serial.print(settings.cyclesRequested);
    Serial.println(" ===");

    cycleNumber++;
    char batchId[40];
    generateBatchId(batchId, sizeof(batchId));

    for (int i = 0; i < stepCount; i++) {
      for (int r = 0; r < sequence[i].repeat; r++) {
        // Stop request check before each relay step (acid/water/mix/rest)
        if (shouldStopVerbose("before step")) {
          Serial.println("Stop requested. Stopping now (step boundary).");
          updateDeviceState("stopping", settings.runId, completed, "");
          stoppedEarly = true;
          break;
        }

        allOff();

        Serial.print("ON: ");
        Serial.print(sequence[i].name);
        if (sequence[i].repeat > 1) {
          Serial.print(" (");
          Serial.print(r + 1);
          Serial.print("/");
          Serial.print(sequence[i].repeat);
          Serial.print(")");
        }
        Serial.println();

        unsigned long startTime = millis();
        digitalWrite(sequence[i].pin, HIGH);
        bool ok = delayWithStopCheck(sequence[i].name, sequence[i].duration, 500);
        digitalWrite(sequence[i].pin, LOW);
        unsigned long durationMs = millis() - startTime;

        if (!ok) {
          Serial.println("Stop requested. Turning relay OFF immediately.");
          updateDeviceState("stopping", settings.runId, completed, "");
          stoppedEarly = true;
          allOff();
          break;
        }

        Serial.print("Duration: ");
        Serial.print(durationMs);
        Serial.println(" ms");

        logRelayOnToSupabase(batchId, sequence[i].name, sequence[i].pinLabel,
                             i, c, durationMs);

        allOff();
        if (!delayWithStopCheck("pause", pauseBetweenRelays, 250)) {
          Serial.println("Stop requested during pause. Stopping.");
          updateDeviceState("stopping", settings.runId, completed, "");
          stoppedEarly = true;
          break;
        }
      }
      if (stoppedEarly) break;
    }
    if (stoppedEarly) break;

    completed = c;
    updateDeviceState("running", settings.runId, completed, "");
  }

  Serial.println(stoppedEarly ? "Stopped. Going idle; waiting for next Run press.\n"
                              : "Run complete. Going idle; waiting for next Run press.\n");
  allOff();
  clearRunCommand();
  updateDeviceState("idle", "", 0, "");
  delay(pollIntervalMs);
}
