import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ProductionCycle } from '../types/relay';

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function useProductionCycles(options?: { todayOnly?: boolean }) {
  const todayOnly = options?.todayOnly ?? false;
  const [cycles, setCycles] = useState<ProductionCycle[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCycles = async () => {
      let query = supabase
        .from('production_cycles')
        .select('*')
        .order('started_at', { ascending: false });
      if (todayOnly) {
        query = query.gte('started_at', startOfTodayISO());
      }
      const { data, error: e } = await query;
      if (e) {
        setError(e.message);
        setLoading(false);
        return;
      }
      const list = (data as ProductionCycle[]) ?? [];
      setCycles(list);
      setTotalProducts(list.length);
      setLoading(false);
    };

    fetchCycles();
  }, [todayOnly]);

  return { cycles, totalProducts, error, loading };
}
