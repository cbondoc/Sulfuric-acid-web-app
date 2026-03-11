import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { DeviceSettings, DeviceState } from '../types/device';

const DEVICE_ID = 'arduino_r4_1';

function newRunId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ControlPanel() {
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [state, setState] = useState<DeviceState | null>(null);
  const [cycles, setCycles] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canRun = useMemo(() => !busy && cycles >= 1 && cycles <= 999, [busy, cycles]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      const [{ data: s, error: se }, { data: st, error: ste }] = await Promise.all([
        supabase.from('device_settings').select('*').eq('device_id', DEVICE_ID).maybeSingle(),
        supabase.from('device_state').select('*').eq('device_id', DEVICE_ID).maybeSingle(),
      ]);

      if (cancelled) return;
      if (se) setError(se.message);
      if (ste) setError((prev) => prev ?? ste.message);

      const settingsRow = (s as DeviceSettings | null) ?? null;
      const stateRow = (st as DeviceState | null) ?? null;

      setSettings(settingsRow);
      setState(stateRow);
      if (settingsRow?.cycles_requested) setCycles(settingsRow.cycles_requested);
    }

    load();

    const channel = supabase
      .channel('device_state_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'device_state', filter: `device_id=eq.${DEVICE_ID}` },
        (payload) => setState(payload.new as DeviceState)
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  async function saveCyclesOnly() {
    setBusy(true);
    setInfo(null);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('device_settings')
        .upsert(
          { device_id: DEVICE_ID, cycles_requested: cycles, updated_at: new Date().toISOString() },
          { onConflict: 'device_id' }
        )
        .select('*')
        .maybeSingle();
      if (e) throw e;
      setSettings((data as DeviceSettings | null) ?? null);
      setInfo('Saved cycles.');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save cycles');
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!canRun) return;
    setBusy(true);
    setInfo(null);
    setError(null);
    try {
      const run_id = newRunId();
      const { data, error: e } = await supabase
        .from('device_settings')
        .upsert(
          {
            device_id: DEVICE_ID,
            cycles_requested: cycles,
            run_requested: true,
            stop_requested: false,
            run_id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'device_id' }
        )
        .select('*')
        .maybeSingle();
      if (e) throw e;
      setSettings((data as DeviceSettings | null) ?? null);
      setInfo(`Run requested (${cycles} cycle${cycles === 1 ? '' : 's'}).`);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to request run');
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setInfo(null);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('device_settings')
        .upsert(
          {
            device_id: DEVICE_ID,
            stop_requested: true,
            run_requested: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'device_id' }
        )
        .select('*')
        .maybeSingle();
      if (e) throw e;
      setSettings((data as DeviceSettings | null) ?? null);
      setInfo('Stop requested.');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to request stop');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-stone-100">Control Panel</h2>
        <p className="text-sm text-stone-500">Set cycles then press Run to start the Arduino.</p>
      </div>

      {(error || info) && (
        <div
          className={`rounded-lg border px-4 py-3 ${
            error
              ? 'border-red-900/50 bg-red-950/30 text-red-300'
              : 'border-emerald-900/40 bg-emerald-950/20 text-emerald-200'
          }`}
        >
          {error ?? info}
        </div>
      )}

      <section className="rounded-xl border border-stone-800 bg-stone-900/30 p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[240px]">
            <label
              htmlFor="cycles-per-run"
              className="block text-xs font-medium uppercase tracking-wider text-stone-500"
            >
              Cycles per run
            </label>
            <input
              id="cycles-per-run"
              value={cycles}
              onChange={(e) => setCycles(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
              type="number"
              min={1}
              max={999}
              className="mt-2 w-full rounded-lg border border-stone-700 bg-stone-950/60 px-3 py-2 text-stone-100 outline-none focus:border-amber-600/60"
            />
            <p className="mt-2 text-xs text-stone-600">
              The Arduino will run exactly this many full cycles, then stop and wait.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={saveCyclesOnly}
              disabled={busy}
              className="rounded-lg border border-stone-700 bg-stone-800/40 px-4 py-2 text-sm font-medium text-stone-200 hover:bg-stone-800 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={run}
              disabled={!canRun}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-amber-400 disabled:opacity-50"
            >
              Run
            </button>
            <button
              onClick={stop}
              disabled={busy}
              className="rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-950/40 disabled:opacity-50"
            >
              Stop
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-amber-900/40 bg-stone-900/50 p-6">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-amber-500/90">
          Device status
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-stone-800 bg-stone-950/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-stone-500">State</p>
            <p className="mt-1 text-lg font-semibold text-stone-100">{state?.status ?? 'unknown'}</p>
            <p className="mt-1 text-xs text-stone-600">
              Heartbeat: {state?.last_heartbeat ? new Date(state.last_heartbeat).toLocaleString() : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-stone-800 bg-stone-950/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Progress</p>
            <p className="mt-1 text-lg font-semibold text-stone-100">
              {state?.cycles_completed ?? 0} / {settings?.cycles_requested ?? cycles}
            </p>
            <p className="mt-1 text-xs text-stone-600">
              Active run: {state?.active_run_id ? `${state.active_run_id.slice(0, 8)}…` : '—'}
            </p>
          </div>
        </div>
        {state?.last_error && (
          <p className="mt-3 text-sm text-red-300">Last error: {state.last_error}</p>
        )}
      </section>
    </div>
  );
}

