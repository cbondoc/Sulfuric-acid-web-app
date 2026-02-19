# Arduino → Supabase payload (per relay ON)

Each **relay ON** event is sent as one HTTP POST to Supabase `relay_logs` table.

## Endpoint

```
POST https://<YOUR_PROJECT>.supabase.co/rest/v1/relay_logs
```

Headers:

- `Content-Type: application/json`
- `apikey: <VITE_SUPABASE_ANON_KEY>`
- `Authorization: Bearer <VITE_SUPABASE_ANON_KEY>`
- `Prefer: return=minimal`

## JSON body (required fields)

```json
{
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "relay_name": "🧪 Container Acid",
  "relay_pin": "A2",
  "sequence_index": 0,
  "cycle_number": 1,
  "duration_ms": 30000
}
```

- **batch_id**: One UUID per full sequence run (same for all steps in that run).
- **relay_name**: Display name of the relay (e.g. "🧪 Container Acid").
- **relay_pin**: Pin identifier as string (e.g. "A0", "A2").
- **sequence_index**: Step index in the sequence (0-based).
- **cycle_number**: Increments each full sequence (1, 2, 3, …).
- **duration_ms**: Time the relay was ON, in milliseconds.

Do **not** send `id` or `created_at`; Supabase sets those.
