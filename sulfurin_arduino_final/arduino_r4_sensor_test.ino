/*
 * Arduino Uno R4 WiFi — sensor + buzzer smoke test
 *
 * Wiring:
 *   D2  → Buzzer signal (and try D8 for tone() tests — see Serial)
 *   A4  → Hydrometer   A5  → TDS
 *
 * Serial Monitor: 115200 baud
 *
 * BUZZER_TEST_MODE:
 *   0 = Normal: sensor readings + hydrometer alarm (A4 raw < 200).
 *   1 = Run full buzzer diagnostic suite once after boot, then normal operation.
 *   2 = Buzzer tests only: repeats the full suite forever (no sensors). Use to debug sound.
 */

const int PIN_BUZZER = 2;
/** R4 docs often use D8 for tone(); we test both D2 and D8. */
const int PIN_BUZZER_TONE_ALT = 8;

const int PIN_HYDRO = A4;
const int PIN_TDS   = A5;

/** 0 = off, 1 = diagnostics once then sensors, 2 = diagnostics loop only */
const int BUZZER_TEST_MODE = 0;

/** Alarm when analog hydrometer reading drops below this (0–1023). */
const int HYDRO_ALARM_BELOW = 200;
const unsigned long ALARM_INTERVAL_MS = 500UL;

/** Alarm tone (Hz). Bitbang/tone() at ~2500 Hz was inaudible on your buzzer; ~1000 Hz from the suite was audible. */
const unsigned ALARM_BEEP_HZ = 1000;

/*
 * Normal alarm driver (when BUZZER_TEST_MODE is 0 or 1):
 *   0 = BITBANG  1 = ACTIVE (DC)  2 = TONE on D2
 */
const uint8_t BUZZER_DRIVER = 0;

const bool BUZZER_SELF_TEST_ON_BOOT = false;

const float VREF = 5.0f;
const int ADC_MAX = 1023;

enum { BUZZER_BITBANG = 0, BUZZER_ACTIVE = 1, BUZZER_TONE = 2 };

float tdsFromVoltage(float volts) {
  if (volts < 0.01f) return 0.0f;
  return (133.42f * volts * volts * volts
        - 255.86f * volts * volts
        + 857.39f * volts) * 0.5f;
}

void buzzerSilence() {
  noTone(PIN_BUZZER);
  noTone(PIN_BUZZER_TONE_ALT);
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_BUZZER_TONE_ALT, LOW);
}

/** Square wave at hz for pulseMs (passive piezo). */
void bitbangHz(unsigned hz, unsigned pulseMs) {
  if (hz < 30) hz = 30;
  if (hz > 10000) hz = 10000;
  unsigned long halfUs = 1000000UL / (2UL * (unsigned long)hz);
  if (halfUs < 2) halfUs = 2;
  unsigned long end = millis() + pulseMs;
  while ((long)(millis() - end) < 0) {
    digitalWrite(PIN_BUZZER, HIGH);
    delayMicroseconds((unsigned)halfUs);
    digitalWrite(PIN_BUZZER, LOW);
    delayMicroseconds((unsigned)halfUs);
  }
}

void alarmPulseBitbang(unsigned pulseMs = 180) {
  bitbangHz(ALARM_BEEP_HZ, pulseMs);
}

void alarmPulseTone(unsigned pulseMs = 180) {
  tone(PIN_BUZZER, ALARM_BEEP_HZ, pulseMs);
  delay(pulseMs + 80);
}

void alarmPulseActive(unsigned pulseMs = 180) {
  digitalWrite(PIN_BUZZER, HIGH);
  delay(pulseMs);
  digitalWrite(PIN_BUZZER, LOW);
}

void alarmPulse() {
  switch (BUZZER_DRIVER) {
    case BUZZER_ACTIVE:
      alarmPulseActive();
      break;
    case BUZZER_TONE:
      alarmPulseTone();
      break;
    case BUZZER_BITBANG:
    default:
      alarmPulseBitbang();
      break;
  }
}

static void pauseBetweenTests() {
  buzzerSilence();
  delay(700);
}

/** Full diagnostic: many patterns on D2; tone() also on D8 (jumper I/O to buzzer to compare). */
void runBuzzerDiagnosticSuite() {
  const unsigned TONE_MS = 600;
  const unsigned BB_MS = 600;

  Serial.println();
  Serial.println(F("========== BUZZER DIAGNOSTIC SUITE =========="));
  Serial.println(F("Listen after each line; silence ~0.7 s between tests."));
  Serial.println();

  Serial.println(F("[1/12] D2 BITBANG ~2500 Hz (often faint vs ~1 kHz on passive piezos)"));
  bitbangHz(2500, BB_MS);
  pauseBetweenTests();

  Serial.println(F("[2/12] D2 BITBANG ~1000 Hz"));
  bitbangHz(1000, BB_MS);
  pauseBetweenTests();

  Serial.println(F("[3/12] D2 BITBANG ~500 Hz"));
  bitbangHz(500, BB_MS);
  pauseBetweenTests();

  Serial.println(F("[4/12] D2 BITBANG ~200 Hz (slow tick)"));
  bitbangHz(200, BB_MS);
  pauseBetweenTests();

  Serial.println(F("[5/12] D2 ACTIVE: steady HIGH 700 ms (active magnetic / 3-pin module)"));
  digitalWrite(PIN_BUZZER, HIGH);
  delay(700);
  digitalWrite(PIN_BUZZER, LOW);
  pauseBetweenTests();

  Serial.println(F("[6/12] D2 ACTIVE: 3 x (200 ms ON, 200 ms OFF)"));
  for (int i = 0; i < 3; i++) {
    digitalWrite(PIN_BUZZER, HIGH);
    delay(200);
    digitalWrite(PIN_BUZZER, LOW);
    delay(200);
  }
  pauseBetweenTests();

  Serial.println(F("[7/12] D2 tone() 1000 Hz"));
  tone(PIN_BUZZER, 1000, TONE_MS);
  delay(TONE_MS + 100);
  pauseBetweenTests();

  Serial.println(F("[8/12] D2 tone() 400 Hz"));
  tone(PIN_BUZZER, 400, TONE_MS);
  delay(TONE_MS + 100);
  pauseBetweenTests();

  Serial.println(F("[9/12] D8 tone() 1000 Hz — move buzzer SIG to D8 if D2 was silent"));
  tone(PIN_BUZZER_TONE_ALT, 1000, TONE_MS);
  delay(TONE_MS + 100);
  pauseBetweenTests();

  Serial.println(F("[10/12] D8 BITBANG ~1000 Hz"));
  {
    unsigned hz = 1000;
    unsigned long halfUs = 1000000UL / (2UL * (unsigned long)hz);
    unsigned long end = millis() + BB_MS;
    while ((long)(millis() - end) < 0) {
      digitalWrite(PIN_BUZZER_TONE_ALT, HIGH);
      delayMicroseconds((unsigned)halfUs);
      digitalWrite(PIN_BUZZER_TONE_ALT, LOW);
      delayMicroseconds((unsigned)halfUs);
    }
  }
  pauseBetweenTests();

  Serial.println(F("[11/12] D2 + D8 both HIGH 300 ms (parallel drive — only if wired to one pin!)"));
  digitalWrite(PIN_BUZZER, HIGH);
  digitalWrite(PIN_BUZZER_TONE_ALT, HIGH);
  delay(300);
  buzzerSilence();
  pauseBetweenTests();

  Serial.println(F("[12/12] D2 BITBANG ~4000 Hz (short)"));
  bitbangHz(4000, 400);
  buzzerSilence();

  Serial.println();
  Serial.println(F("========== END SUITE =========="));
  Serial.println(F("If everything was silent: check GND, 5V/active module power, transistor if needed."));
  Serial.println(F("If only [9]/[10] on D8 worked, prefer D8 or tone() for your alarm."));
  Serial.println();
}

void setup() {
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_BUZZER_TONE_ALT, OUTPUT);
  buzzerSilence();

  Serial.begin(115200);
  unsigned long t0 = millis();
  while (!Serial && millis() - t0 < 4000) { }

  Serial.println();
  Serial.println(F("=== R4 WiFi: hydrometer A4, TDS A5, buzzer D2 ==="));
  Serial.print(F("BUZZER_TEST_MODE="));
  Serial.print(BUZZER_TEST_MODE);
  Serial.println(F(" (0=sensors 1=suite once + sensors 2=suite loop only)"));

  if (BUZZER_TEST_MODE == 1) {
    runBuzzerDiagnosticSuite();
  }

  if (BUZZER_TEST_MODE == 0) {
    Serial.print(F("Alarm when A4 raw < "));
    Serial.print(HYDRO_ALARM_BELOW);
    Serial.print(F(" — beep "));
    Serial.print(ALARM_BEEP_HZ);
    Serial.println(F(" Hz"));
    if (BUZZER_SELF_TEST_ON_BOOT) {
      Serial.println(F("Quick chirp..."));
      alarmPulse();
      delay(200);
      alarmPulse();
      Serial.println(F("Done."));
    }
  }
}

void loop() {
  if (BUZZER_TEST_MODE == 2) {
    runBuzzerDiagnosticSuite();
    Serial.println(F("Repeating in 4 seconds... (set BUZZER_TEST_MODE to 0 or 1 when done)"));
    delay(4000);
    return;
  }

  static unsigned long lastPrint = 0;
  static unsigned long lastAlarmPulse = 0;
  unsigned long now = millis();

  int rawH = analogRead(PIN_HYDRO);
  int rawT = analogRead(PIN_TDS);
  float vH = rawH * (VREF / (float)ADC_MAX);
  float vT = rawT * (VREF / (float)ADC_MAX);
  float tdsGPerMl = tdsFromVoltage(vT) * 1.0e-6f;

  const bool hydroLow = rawH < HYDRO_ALARM_BELOW;
  if (hydroLow) {
    if (now - lastAlarmPulse >= ALARM_INTERVAL_MS) {
      lastAlarmPulse = now;
      alarmPulse();
    }
  } else {
    buzzerSilence();
    lastAlarmPulse = 0;
  }

  if (now - lastPrint >= 1000UL) {
    lastPrint = now;
    Serial.print(F("A4 hydrometer  raw="));
    Serial.print(rawH);
    Serial.print(F("  V="));
    Serial.print(vH, 3);
    if (hydroLow) Serial.print(F("  **ALARM**"));

    Serial.print(F("  |  A5 TDS  raw="));
    Serial.print(rawT);
    Serial.print(F("  V="));
    Serial.print(vT, 3);
    Serial.print(F("  TDS="));
    Serial.print(tdsGPerMl, 6);
    Serial.println(F(" g/mL (ppm as mg/L * 1e-6, ~25C)"));
  }
}
