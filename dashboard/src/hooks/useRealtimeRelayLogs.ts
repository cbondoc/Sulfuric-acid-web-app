import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { RelayLog } from '../types/relay';

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

type TodayOnlyOptions = { todayOnly?: boolean };

/** Latest relay event (current active relay display). */
export function useLatestRelayEvent(options?: TodayOnlyOptions) {
  const todayOnly = options?.todayOnly ?? false;
  const [event, setEvent] = useState<RelayLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLatest = async () => {
      let query = supabase
        .from('relay_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
      if (todayOnly) {
        query = query.gte('created_at', startOfTodayISO());
      }
      const { data, error: e } = await query.maybeSingle();
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
          const newEvent = payload.new as RelayLog;
          if (todayOnly && newEvent.created_at < startOfTodayISO()) return;
          setEvent(newEvent);
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
  }, [todayOnly]);

  return { event, error };
}

/** Live-updating list of recent relay events (for log table). */
export function useRealtimeRelayLogs(limit = 50, options?: TodayOnlyOptions) {
  const todayOnly = options?.todayOnly ?? false;
  const [logs, setLogs] = useState<RelayLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInitial = async () => {
      let query = supabase
        .from('relay_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (todayOnly) {
        query = query.gte('created_at', startOfTodayISO());
      }
      const { data, error: e } = await query;
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
          const newRow = payload.new as RelayLog;
          if (todayOnly && newRow.created_at < startOfTodayISO()) return;
          setLogs((prev) => [newRow, ...prev].slice(0, limit));
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
  }, [limit, todayOnly]);

  return { logs, error };
}
