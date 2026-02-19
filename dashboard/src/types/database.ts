import type { RelayLog, ProductionCycle } from './relay';

export type Tables = {
  relay_logs: {
    Row: RelayLog;
    Insert: Omit<RelayLog, 'id' | 'created_at'> & {
      id?: string;
      created_at?: string;
    };
    Update: Partial<RelayLog>;
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
