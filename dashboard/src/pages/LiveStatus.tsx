import { useProductionCycles } from '../hooks/useProductionCycles';
import { useLatestRelayEvent, useRealtimeRelayLogs } from '../hooks/useRealtimeRelayLogs';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

export function LiveStatus() {
  const { event: currentEvent, error: currentError } = useLatestRelayEvent({ todayOnly: true });
  const { logs, error: logsError } = useRealtimeRelayLogs(50, { todayOnly: true });
  const { totalProducts: cyclesFinished, loading: cyclesLoading } = useProductionCycles({ todayOnly: true });

  const err = currentError ?? logsError;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-stone-900">Live Status</h2>
          <p className="text-sm text-stone-600">Current relay and real-time event log</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
          <p className="text-xs font-medium uppercase tracking-wider text-stone-600">
            Cycles finished
          </p>
          <p className="text-2xl font-bold text-amber-700">
            {cyclesLoading ? '…' : cyclesFinished}
          </p>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          {err}
        </div>
      )}

      {/* Current active relay */}
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-6">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-amber-800">
          Current active relay
        </h3>
        {currentEvent ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-2xl" aria-hidden>
              {currentEvent.relay_name.startsWith('🧪')
                ? '🧪'
                : currentEvent.relay_name.startsWith('💧')
                  ? '💧'
                  : currentEvent.relay_name.startsWith('⚙️')
                    ? '⚙️'
                    : '🛑'}
            </span>
            <div>
              <p className="font-medium text-stone-900">{currentEvent.relay_name}</p>
              <p className="text-sm text-stone-600">
                Pin {currentEvent.relay_pin} · {currentEvent.duration_ms} ms
              </p>
              <p className="mt-1 text-xs text-stone-500">{formatTime(currentEvent.created_at)}</p>
            </div>
          </div>
        ) : (
          <p className="text-stone-600">No relay events yet. Waiting for data…</p>
        )}
      </section>

      {/* Live log table */}
      <section className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
        <h3 className="border-b border-stone-200 px-4 py-3 text-sm font-medium text-stone-700">
          Recent relay events (live)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-amber-50/80">
                <th className="px-4 py-2 font-medium text-stone-600">Time</th>
                <th className="px-4 py-2 font-medium text-stone-600">Relay</th>
                <th className="px-4 py-2 font-medium text-stone-600">Pin</th>
                <th className="px-4 py-2 font-medium text-stone-600">Seq</th>
                <th className="px-4 py-2 font-medium text-stone-600">Cycle</th>
                <th className="px-4 py-2 font-medium text-stone-600">Duration</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-stone-600">
                    No events yet.
                  </td>
                </tr>
              )}
              {logs.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-stone-200/90 hover:bg-amber-50/60"
                >
                  <td className="px-4 py-2 text-stone-600">{formatTime(row.created_at)}</td>
                  <td className="px-4 py-2 text-stone-900">{row.relay_name}</td>
                  <td className="px-4 py-2 text-stone-600">{row.relay_pin}</td>
                  <td className="px-4 py-2 text-stone-600">{row.sequence_index}</td>
                  <td className="px-4 py-2 text-stone-600">{row.cycle_number}</td>
                  <td className="px-4 py-2 text-stone-600">{row.duration_ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
