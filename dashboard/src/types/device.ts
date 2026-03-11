export interface DeviceSettings {
  device_id: string;
  cycles_requested: number;
  run_requested: boolean;
  stop_requested: boolean;
  run_id: string | null;
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
}

