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
const char SUPABASE_PATH[] = "/rest/v1/relay_logs";

WiFiSSLClient sslClient;

/* ==================== RELAY ==================== */
int mixerDuration      = 10000;   // Relay 1 (Mixer)
int containerRestTime  = 30000;   // Relay 2 (Container Rest)
int containerAcidTime  = 30000;   // Relay 3 (Container Acid)
int containerWaterTime = 30000;   // Relay 4 (Container Water)
int pauseBetweenRelays = 1000;
int restartDelay       = 3000;

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

/* ==================== HELPERS ==================== */
void allOff() {
  for (int i = 0; i < stepCount; i++)
    digitalWrite(sequence[i].pin, LOW);
  Serial.println("All relays OFF");
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

  sslClient.println("POST " + String(SUPABASE_PATH) + " HTTP/1.1");
  sslClient.println("Host: " + String(SUPABASE_HOST));
  sslClient.println("apikey: " + String(SUPABASE_API_KEY));
  sslClient.println("Authorization: Bearer " + String(SUPABASE_API_KEY));
  sslClient.println("Content-Type: application/json");
  sslClient.println("Prefer: return=minimal");
  sslClient.print("Content-Length: ");
  sslClient.println(strlen(body));
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
}

/* ==================== LOOP ==================== */
void loop() {
  cycleNumber++;
  char batchId[40];
  generateBatchId(batchId, sizeof(batchId));

  for (int i = 0; i < stepCount; i++) {
    for (int r = 0; r < sequence[i].repeat; r++) {
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
      delay(sequence[i].duration);
      digitalWrite(sequence[i].pin, LOW);
      unsigned long durationMs = millis() - startTime;

      Serial.print("Duration: ");
      Serial.print(durationMs);
      Serial.println(" ms");

      logRelayOnToSupabase(batchId, sequence[i].name, sequence[i].pinLabel,
                           i, cycleNumber, durationMs);

      allOff();
      delay(pauseBetweenRelays);
    }
  }

  Serial.println("Sequence complete. Restarting...\n");
  allOff();
  delay(restartDelay);
}
