import type { RelayLog, ProductionCycle } from './relay';
import type { DeviceSettings, DeviceState } from './device';

export type Tables = {
  relay_logs: {
    Row: RelayLog;
    Insert: Omit<RelayLog, 'id' | 'created_at'> & {
      id?: string;
      created_at?: string;
    };
    Update: Partial<RelayLog>;
  };
  device_settings: {
    Row: DeviceSettings;
    Insert: Partial<DeviceSettings> & { device_id: string };
    Update: Partial<DeviceSettings>;
  };
  device_state: {
    Row: DeviceState;
    Insert: Partial<DeviceState> & { device_id: string };
    Update: Partial<DeviceState>;
  };
};

export type Views = {
  production_cycles: {
    Row: ProductionCycle;
  };
};

export type Database = {
  public: {
    Tables: Tables;
    Views: Views;
  };
};
