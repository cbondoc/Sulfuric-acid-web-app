// === RELAY SEQUENCE CONTROLLER (Active HIGH) ===
// Sequence: Acid → Water → Mixer → Rest (x2)
// Each relay activates one by one for its set duration.
// Optionally logs each relay ON to Supabase (ESP32/ESP8266 only).
//
// --- Relay Mapping ---
// A0 → Relay 1 → Mixer (220V)
// A1 → Relay 2 → Container Rest
// A2 → Relay 3 → Container Acid
// A3 → Relay 4 → Container Water

// --- Supabase (ESP32/ESP8266 only): set in Arduino IDE or uncomment below ---
// #define SUPABASE_URL "https://xxxx.supabase.co"
// #define SUPABASE_ANON_KEY "your-anon-key"
// #define WIFI_SSID "your-ssid"
// #define WIFI_PASS "your-password"

// --- Adjustable Durations (ms) ---
int mixerDuration      = 10000;   // Relay 1 (Mixer)
int containerRestTime  = 30000;   // Relay 2 (Container Rest)
int containerAcidTime  = 30000;   // Relay 3 (Container Acid)
int containerWaterTime = 30000;   // Relay 4 (Container Water)
int pauseBetweenRelays = 1000;    // Pause between relays
int restartDelay       = 3000;    // Delay before restarting sequence

// --- Relay step definition ---
struct RelayStep {
  int pin;               // Relay pin
  const char* pinLabel;  // Pin as string for logging (e.g. "A0")
  const char* name;      // Relay name
  unsigned long duration;// ON time
  int repeat;            // How many times to repeat
};

// --- Define sequence here ---
RelayStep sequence[] = {
  {A2, "A2", "🧪 Container Acid",  containerAcidTime, 1},
  {A3, "A3", "💧 Container Water", containerWaterTime, 1},
  {A0, "A0", "⚙️ Mixer",           mixerDuration,     1},
  {A1, "A1", "🛑 Container Rest",  containerRestTime,  2}  // run twice
};
int stepCount = sizeof(sequence) / sizeof(sequence[0]);

// Global cycle count (incremented each full sequence) for Supabase cycle_number
int cycleNumber = 0;

// Generate a UUID v4-like string into buf (min 37 bytes). Used for batch_id on ESP.
void generateBatchId(char* buf, size_t len) {
#if defined(ESP32) || defined(ESP8266)
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
#else
  snprintf(buf, len, "00000000-0000-4000-8000-000000000000");
#endif
}

// --- Function to turn all relays OFF ---
void allOff() {
  for (int i = 0; i < stepCount; i++) {
    digitalWrite(sequence[i].pin, LOW);
  }
  Serial.println("⚠️ All relays OFF (safety reset)");
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Starting Relay Sequence (Rest x2 Loop) ===");

  for (int i = 0; i < stepCount; i++) {
    pinMode(sequence[i].pin, OUTPUT);
    digitalWrite(sequence[i].pin, LOW); // all OFF
  }

  delay(2000);
}

// --- Supabase log (no-op if not ESP or macros not set) ---
void logRelayOnToSupabase(const char* batchId, const char* relayName, const char* relayPin,
                          int sequenceIndex, int cycleNum, unsigned long durationMs) {
#if defined(ESP32) || defined(ESP8266)
  #if defined(SUPABASE_URL) && defined(SUPABASE_ANON_KEY)
  // See arduino_supabase_payload.md for payload format.
  // Example for ESP32: use WiFiClient + HTTPClient, POST to SUPABASE_URL/rest/v1/relay_logs
  // with headers apikey, Authorization, Content-Type, and body:
  // {"batch_id":"<batchId>","relay_name":"<relayName>","relay_pin":"<relayPin>",
  //  "sequence_index":<sequenceIndex>,"cycle_number":<cycleNum>,"duration_ms":<durationMs>}
  (void)batchId;
  (void)relayName;
  (void)relayPin;
  (void)sequenceIndex;
  (void)cycleNum;
  (void)durationMs;
  #endif
#else
  (void)batchId;
  (void)relayName;
  (void)relayPin;
  (void)sequenceIndex;
  (void)cycleNum;
  (void)durationMs;
#endif
}

void loop() {
  cycleNumber++;

  char batchId[40];
  generateBatchId(batchId, sizeof(batchId));

  for (int i = 0; i < stepCount; i++) {
    for (int r = 0; r < sequence[i].repeat; r++) {
      allOff(); // ensure only one relay ON at a time

      Serial.print("🔛 Turning ON: ");
      Serial.print(sequence[i].name);
      if (sequence[i].repeat > 1) {
        Serial.print(" (Cycle ");
        Serial.print(r + 1);
        Serial.print(" of ");
        Serial.print(sequence[i].repeat);
        Serial.print(")");
      }
      Serial.println();

      unsigned long startTime = millis();
      digitalWrite(sequence[i].pin, HIGH);   // relay ON
      delay(sequence[i].duration);
      digitalWrite(sequence[i].pin, LOW);   // relay OFF
      unsigned long durationMs = millis() - startTime;

      Serial.print("⏱ Duration: ");
      Serial.print(durationMs);
      Serial.println(" ms\n");

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