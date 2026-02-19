import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ProductionCycle } from '../types/relay';

export function useProductionCycles() {
  const [cycles, setCycles] = useState<ProductionCycle[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCycles = async () => {
      const { data, error: e } = await supabase
        .from('production_cycles')
        .select('*')
        .order('started_at', { ascending: false });
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
  }, []);

  return { cycles, totalProducts, error, loading };
}
