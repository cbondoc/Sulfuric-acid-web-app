import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { RelayLog } from '../types/relay';

/** Latest relay event (current active relay display). */
export function useLatestRelayEvent() {
  const [event, setEvent] = useState<RelayLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLatest = async () => {
      const { data, error: e } = await supabase
        .from('relay_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e) {
        setError(e.message);
        return;
      }
      setEvent(data as RelayLog | null);
    };

    fetchLatest();

    const channel = supabase
      .channel('relay_logs_inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'relay_logs' },
        (payload) => {
          setEvent(payload.new as RelayLog);
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          setError(err?.message ?? 'Realtime subscription failed');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { event, error };
}

/** Live-updating list of recent relay events (for log table). */
export function useRealtimeRelayLogs(limit = 50) {
  const [logs, setLogs] = useState<RelayLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInitial = async () => {
      const { data, error: e } = await supabase
        .from('relay_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (e) {
        setError(e.message);
        return;
      }
      setLogs((data as RelayLog[]) ?? []);
    };

    fetchInitial();

    const channel = supabase
      .channel('relay_logs_list')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'relay_logs' },
        (payload) => {
          setLogs((prev) => [payload.new as RelayLog, ...prev].slice(0, limit));
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          setError(err?.message ?? 'Realtime subscription failed');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [limit]);

  return { logs, error };
}
