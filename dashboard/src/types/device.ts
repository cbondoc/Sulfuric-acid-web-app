export interface DeviceSettings {
  device_id: string;
  cycles_requested: number;
  run_requested: boolean;
  stop_requested: boolean;
  run_id: string | null;
  mixer_duration_ms: number;
  container_rest_duration_ms: number;
  container_acid_duration_ms: number;
  container_water_duration_ms: number;
  updated_at: string;
}

export interface DeviceState {
  device_id: string;
  status: 'offline' | 'idle' | 'running' | 'stopping' | 'error';
  active_run_id: string | null;
  cycles_completed: number;
  last_error: string | null;
  last_heartbeat: string;
  updated_at: string;
  /** Analog raw 0–1023 from Arduino A4 */
  hydrometer_raw?: number | null;
  /** True when raw is below firmware threshold (device requests stop) */
  hydrometer_low?: boolean;
  /** TDS module analog 0–1023 (A5) */
  tds_analog_raw?: number | null;
  /** Mass concentration (g/mL); sensor ppm treated as mg/L, multiplied by 1e-6 */
  tds_g_per_ml?: number | null;
  /** True while hydrometer is low (buzzer alarm pattern active on D2) */
  buzzer_alarm?: boolean;
}

