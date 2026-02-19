# Sulfuric Acid Mixing Dashboard

Public web dashboard for real-time relay activity and production statistics from an Arduino-controlled sulfuric acid + water mixing system. The Arduino runs a fixed relay sequence, logs each relay ON event to Supabase, and the web app visualizes state, history, total cycles, and process info.

## Tech stack

- **Frontend:** Vite, TypeScript, Tailwind CSS, React, React Router
- **Backend / DB:** Supabase (PostgreSQL)
- **Communication:** Arduino → Supabase REST API; dashboard ← Supabase Realtime

---

## 1. Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run the contents of **`supabase/schema.sql`**:
   - Creates `relay_logs` table and indexes
   - Enables Realtime for `relay_logs`
   - Creates `production_cycles` view
   - Optional RLS policies for public read and anon insert

---

## 2. Web dashboard

### Setup

```bash
cd dashboard
npm install
cp .env.example .env
```

Edit **`.env`**:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Run

```bash
npm run dev
```

Open the URL shown (e.g. http://localhost:5173).

### Build

```bash
npm run build
```

Output is in `dist/`. Deploy to any static host (Vercel, Netlify, etc.).

### Pages

- **Live Status** — Current active relay and live-updating relay event table (Supabase Realtime).
- **Production Summary** — Total products made and table of completed batches (from `production_cycles` view).
- **Process Information** — Mixing sequence, timing, safety notes, disclaimer (static).

---

## 3. Arduino

### Behavior

- Runs a fixed sequence: **Container Acid** → **Container Water** → **Mixer** → **Container Rest** (×2).
- One relay ON at a time; repeats the full sequence indefinitely.
- Logs **only relay ON** events to Supabase (one HTTP POST per event) with:
  - `batch_id` (one UUID per full sequence)
  - `relay_name`, `relay_pin`, `sequence_index`, `cycle_number`, `duration_ms`

### Sketches

- **`sulfuric_arduino/sulfuric_arduino.ino`** — Core sequence logic; optional Supabase logging when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are defined (ESP32/ESP8266). Use on AVR (e.g. Uno) for relay-only operation without logging.
- **`sulfuric_arduino/sulfuric_arduino_esp32.ino`** — Full ESP32 sketch with WiFi and HTTP POST to Supabase. Set `WIFI_SSID`, `WIFI_PASS`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` and upload.

### Payload format

See **`sulfuric_arduino/arduino_supabase_payload.md`** for the exact JSON body and headers for each relay ON insert.

---

## 4. Realtime

The dashboard subscribes to Supabase with:

- `channel().on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'relay_logs' }, ...)`

So new rows in `relay_logs` (from the Arduino) update the Live Status and event table without refresh.

---

## 5. Project layout

```
dashboard/
  src/
    lib/supabase.ts      # Supabase client
    types/               # relay_logs, production_cycles, database
    hooks/               # useRealtimeRelayLogs, useProductionCycles
    pages/               # LiveStatus, ProductionSummary, ProcessInfo
    components/          # Layout (nav + outlet)
supabase/
  schema.sql             # Tables, view, Realtime, RLS
sulfuric_arduino/
  sulfuric_arduino.ino           # Main sequence (+ optional Supabase)
  sulfuric_arduino_esp32.ino     # ESP32 + WiFi + Supabase POST
  arduino_supabase_payload.md    # REST payload spec
```

---

## 6. Environment variables (summary)

| Variable | Where | Purpose |
|----------|--------|---------|
| `VITE_SUPABASE_URL` | Dashboard `.env` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Dashboard `.env` | Supabase anon key (client) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Arduino (ESP32) | Same project; used for REST inserts |
| `WIFI_SSID` / `WIFI_PASS` | Arduino (ESP32) | WiFi credentials |

Use the same Supabase project URL and anon key for both the dashboard and the Arduino so inserts appear in the same `relay_logs` table and Realtime works.
