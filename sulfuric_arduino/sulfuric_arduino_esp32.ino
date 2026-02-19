// === ESP32 version: Relay sequence + Supabase logging ===
// Uses WiFi and HTTPClient to POST each relay ON event to Supabase.
// Copy this to a new sketch, install ESP32 board support and WiFi/HTTPClient (built-in).
//
// 1. Set WIFI_SSID, WIFI_PASS, SUPABASE_URL, SUPABASE_ANON_KEY below.
// 2. Run supabase/schema.sql in your Supabase project.
// 3. Upload and open Serial Monitor.

#include <WiFi.h>
#include <HTTPClient.h>

#define WIFI_SSID     "your-ssid"
#define WIFI_PASS     "your-password"
#define SUPABASE_URL  "https://xxxx.supabase.co"
#define SUPABASE_ANON_KEY "your-anon-key"

// --- Relay mapping (GPIO numbers on ESP32; change to match your wiring) ---
#define PIN_ACID   25
#define PIN_WATER  26
#define PIN_MIXER  27
#define PIN_REST   32

int mixerDuration      = 10000;
int containerRestTime  = 30000;
int containerAcidTime  = 30000;
int containerWaterTime = 30000;
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
  {PIN_ACID,  "25", "🧪 Container Acid",  containerAcidTime, 1},
  {PIN_WATER, "26", "💧 Container Water", containerWaterTime, 1},
  {PIN_MIXER, "27", "⚙️ Mixer",           mixerDuration,     1},
  {PIN_REST,  "32", "🛑 Container Rest",  containerRestTime,  2}
};
const int stepCount = 4;
int cycleNumber = 0;

void allOff() {
  for (int i = 0; i < stepCount; i++)
    digitalWrite(sequence[i].pin, LOW);
  Serial.println("⚠️ All relays OFF");
}

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

// Escape " and \ for JSON string
void escapeJsonString(const char* in, char* out, size_t outLen) {
  size_t j = 0;
  for (size_t i = 0; in[i] && j < outLen - 2; i++) {
    if (in[i] == '"' || in[i] == '\\') out[j++] = '\\';
    if (j < outLen - 1) out[j++] = in[i];
  }
  out[j] = '\0';
}

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

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/relay_logs";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " SUPABASE_ANON_KEY);
  http.addHeader("Prefer", "return=minimal");

  int code = http.POST(body);
  http.end();

  if (code != 201 && code != 200) {
    Serial.printf("Supabase POST failed: %d\n", code);
    return false;
  }
  return true;
}

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < stepCount; i++) {
    pinMode(sequence[i].pin, OUTPUT);
    digitalWrite(sequence[i].pin, LOW);
  }
  randomSeed(esp_random());

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected.");
  delay(1000);
}

void loop() {
  cycleNumber++;
  char batchId[40];
  generateBatchId(batchId, sizeof(batchId));

  for (int i = 0; i < stepCount; i++) {
    for (int r = 0; r < sequence[i].repeat; r++) {
      allOff();

      Serial.print("🔛 ");
      Serial.println(sequence[i].name);

      unsigned long startTime = millis();
      digitalWrite(sequence[i].pin, HIGH);
      delay(sequence[i].duration);
      digitalWrite(sequence[i].pin, LOW);
      unsigned long durationMs = millis() - startTime;

      Serial.printf("⏱ %lu ms\n", durationMs);
      logRelayOnToSupabase(batchId, sequence[i].name, sequence[i].pinLabel,
                           i, cycleNumber, durationMs);

      allOff();
      delay(pauseBetweenRelays);
    }
  }

  Serial.println("✅ Sequence complete. Restarting...\n");
  allOff();
  delay(restartDelay);
}
