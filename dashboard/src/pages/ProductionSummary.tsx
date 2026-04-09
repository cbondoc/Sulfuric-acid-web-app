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
        <h2 className="text-xl font-semibold text-stone-900">Production Summary</h2>
        <p className="text-sm text-stone-600">Total products and completed batches</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          {error}
        </div>
      )}

      {/* Total products */}
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-6">
        <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-amber-800">
          Total products made
        </h3>
        {loading ? (
          <p className="text-stone-600">Loading…</p>
        ) : (
          <p className="text-4xl font-bold text-amber-700">{totalProducts}</p>
        )}
      </section>

      {/* Daily production chart – last 30 days */}
      <section className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
        <h3 className="border-b border-stone-200 px-4 py-3 text-sm font-medium text-stone-700">
          Production per day (last 30 days)
        </h3>
        <div className="p-4">
          {loading ? (
            <p className="text-stone-600">Loading…</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="prodGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(234 179 8)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="rgb(234 179 8)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'rgb(87 83 78)', fontSize: 11 }}
                    axisLine={{ stroke: 'rgb(214 211 209)' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: 'rgb(87 83 78)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={24}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgb(255 255 255)',
                      border: '1px solid rgb(214 211 209)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    labelStyle={{ color: 'rgb(41 37 36)' }}
                    formatter={(value: number | undefined) => [value ?? 0, 'Products']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="rgb(202 138 4)"
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
      <section className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
        <h3 className="border-b border-stone-200 px-4 py-3 text-sm font-medium text-stone-700">
          Completed batches
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-amber-50/80">
                <th className="px-4 py-2 font-medium text-stone-600">Batch ID</th>
                <th className="px-4 py-2 font-medium text-stone-600">Started</th>
                <th className="px-4 py-2 font-medium text-stone-600">Finished</th>
              </tr>
            </thead>
            <tbody>
              {!loading && cycles.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-stone-600">
                    No completed batches yet.
                  </td>
                </tr>
              )}
              {cycles.map((c) => (
                <tr
                  key={c.batch_id}
                  className="border-b border-stone-200/90 hover:bg-amber-50/60"
                >
                  <td className="px-4 py-2 font-mono text-xs text-stone-600">
                    {c.batch_id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-2 text-stone-800">{formatTime(c.started_at)}</td>
                  <td className="px-4 py-2 text-stone-800">{formatTime(c.finished_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
