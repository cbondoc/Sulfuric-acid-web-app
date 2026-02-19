/** Single relay ON event as stored in relay_logs */
export interface RelayLog {
  id: string;
  batch_id: string;
  relay_name: string;
  relay_pin: string;
  sequence_index: number;
  cycle_number: number;
  duration_ms: number;
  created_at: string;
}

/** Payload the Arduino sends per relay ON (Supabase insert) */
export interface RelayLogInsert {
  batch_id: string;
  relay_name: string;
  relay_pin: string;
  sequence_index: number;
  cycle_number: number;
  duration_ms: number;
}

/** One completed product cycle (from production_cycles view) */
export interface ProductionCycle {
  batch_id: string;
  started_at: string;
  finished_at: string;
}
