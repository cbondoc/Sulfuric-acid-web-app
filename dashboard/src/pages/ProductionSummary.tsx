import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useProductionCycles } from '../hooks/useProductionCycles';
import type { ProductionCycle } from '../types/relay';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

/** Build daily production counts for the last 30 days (by finished_at date). */
function dailyProductionForPastMonth(cycles: ProductionCycle[]): { date: string; count: number; label: string }[] {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const days: { date: string; count: number; label: string }[] = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dateKey = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    days.push({ date: dateKey, count: 0, label });
  }

  for (const c of cycles) {
    const finished = new Date(c.finished_at);
    finished.setHours(0, 0, 0, 0);
    const dateKey = finished.toISOString().slice(0, 10);
    const entry = days.find((d) => d.date === dateKey);
    if (entry) entry.count += 1;
  }

  return days;
}

export function ProductionSummary() {
  const { cycles, totalProducts, error, loading } = useProductionCycles();
  const dailyData = useMemo(() => dailyProductionForPastMonth(cycles), [cycles]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-stone-100">Production Summary</h2>
        <p className="text-sm text-stone-500">Total products and completed batches</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-red-300">
          {error}
        </div>
      )}

      {/* Total products */}
      <section className="rounded-xl border border-amber-900/40 bg-stone-900/50 p-6">
        <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-amber-500/90">
          Total products made
        </h3>
        {loading ? (
          <p className="text-stone-500">Loading…</p>
        ) : (
          <p className="text-4xl font-bold text-amber-400">{totalProducts}</p>
        )}
      </section>

      {/* Daily production chart – last 30 days */}
      <section className="rounded-xl border border-stone-800 bg-stone-900/30 overflow-hidden">
        <h3 className="border-b border-stone-800 px-4 py-3 text-sm font-medium text-stone-400">
          Production per day (last 30 days)
        </h3>
        <div className="p-4">
          {loading ? (
            <p className="text-stone-500">Loading…</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="prodGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(251 191 36)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="rgb(251 191 36)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'rgb(163 163 163)', fontSize: 11 }}
                    axisLine={{ stroke: 'rgb(68 64 60)' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: 'rgb(163 163 163)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={24}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgb(41 37 36)',
                      border: '1px solid rgb(68 64 60)',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'rgb(214 211 209)' }}
                    formatter={(value: number) => [value, 'Products']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="rgb(251 191 36)"
                    strokeWidth={2}
                    fill="url(#prodGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Batches table */}
      <section className="rounded-xl border border-stone-800 bg-stone-900/30 overflow-hidden">
        <h3 className="border-b border-stone-800 px-4 py-3 text-sm font-medium text-stone-400">
          Completed batches
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-800 bg-stone-900/50">
                <th className="px-4 py-2 font-medium text-stone-500">Batch ID</th>
                <th className="px-4 py-2 font-medium text-stone-500">Started</th>
                <th className="px-4 py-2 font-medium text-stone-500">Finished</th>
              </tr>
            </thead>
            <tbody>
              {!loading && cycles.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-stone-500">
                    No completed batches yet.
                  </td>
                </tr>
              )}
              {cycles.map((c) => (
                <tr
                  key={c.batch_id}
                  className="border-b border-stone-800/80 hover:bg-stone-800/30"
                >
                  <td className="px-4 py-2 font-mono text-xs text-stone-400">
                    {c.batch_id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-2 text-stone-300">{formatTime(c.started_at)}</td>
                  <td className="px-4 py-2 text-stone-300">{formatTime(c.finished_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
