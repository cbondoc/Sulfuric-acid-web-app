import { useProductionCycles } from '../hooks/useProductionCycles';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

export function ProductionSummary() {
  const { cycles, totalProducts, error, loading } = useProductionCycles();

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
