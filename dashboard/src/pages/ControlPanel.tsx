import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { DeviceSettings, DeviceState } from '../types/device';

const DEVICE_ID = 'arduino_r4_1';

/** Refetch device_state while Control Panel is open (realtime backup; works if Realtime is off). */
const DEVICE_STATE_POLL_MS = 1500;

/** If no device_state update in this window, treat as not reaching the cloud (WiFi / internet / Supabase). */
const HEARTBEAT_ONLINE_MAX_AGE_MS = 60_000;

function coerceFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mergeDeviceStateRow(
  prev: DeviceState | null,
  incoming: Record<string, unknown> | null | undefined
): DeviceState | null {
  if (!incoming || typeof incoming !== 'object') return prev;
  if (!prev) return incoming as unknown as DeviceState;
  return { ...prev, ...incoming } as DeviceState;
}

function clampDurationSec(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(86400, Math.floor(n)));
}

/**
 * Default relay ON times in seconds (text) — match `sulfurin_arduino_final.ino` ms globals.
 * Acid 100000 ms, water 100000 ms, mixer 10000 ms, rest 110000 ms.
 */
const DEFAULT_RELAY_DURATION_SEC = {
  acid: '100',
  water: '100',
  mixer: '10',
  rest: '110',
} as const;

function defaultRelayDurationMs(kind: keyof typeof DEFAULT_RELAY_DURATION_SEC): number {
  return clampDurationSec(Number(DEFAULT_RELAY_DURATION_SEC[kind])) * 1000;
}

/** Convert stored ms → whole seconds for the form (UI is always seconds). */
function durationMsToInputSeconds(ms: number): number {
  return clampDurationSec(Math.round(ms / 1000));
}

function durationPayloadFromSeconds(mixerSec: number, restSec: number, acidSec: number, waterSec: number) {
  return {
    mixer_duration_ms: clampDurationSec(mixerSec) * 1000,
    container_rest_duration_ms: clampDurationSec(restSec) * 1000,
    container_acid_duration_ms: clampDurationSec(acidSec) * 1000,
    container_water_duration_ms: clampDurationSec(waterSec) * 1000,
  };
}

function newRunId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function heartbeatAgeMs(lastHeartbeat: string | null | undefined): number | null {
  if (!lastHeartbeat) return null;
  const t = Date.parse(lastHeartbeat);
  if (!Number.isFinite(t)) return null;
  return Date.now() - t;
}

function formatAgeShort(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function ControlPanel() {
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [state, setState] = useState<DeviceState | null>(null);
  const [cycles, setCycles] = useState<number>(1);
  const [mixerSec, setMixerSec] = useState(() => durationMsToInputSeconds(defaultRelayDurationMs('mixer')));
  const [restSec, setRestSec] = useState(() => durationMsToInputSeconds(defaultRelayDurationMs('rest')));
  const [acidSec, setAcidSec] = useState(() => durationMsToInputSeconds(defaultRelayDurationMs('acid')));
  const [waterSec, setWaterSec] = useState(() => durationMsToInputSeconds(defaultRelayDurationMs('water')));
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);
  const [countdownLabel, setCountdownLabel] = useState<'Run' | 'Stop' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  /** Re-render periodically so “last seen” / online threshold updates without new device_state rows. */
  const [, setConnectivityTick] = useState(0);

  const canRun = useMemo(
    () => !busy && countdown === 0 && cycles >= 1 && cycles <= 999,
    [busy, countdown, cycles]
  );
  const controlsDisabled = busy;

  function startCountdown(label: 'Run' | 'Stop', seconds = 10) {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    setCountdownLabel(label);
    setCountdown(seconds);
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          setCountdownLabel(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

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
      setMixerSec(
        durationMsToInputSeconds(settingsRow?.mixer_duration_ms ?? defaultRelayDurationMs('mixer'))
      );
      setRestSec(
        durationMsToInputSeconds(settingsRow?.container_rest_duration_ms ?? defaultRelayDurationMs('rest'))
      );
      setAcidSec(
        durationMsToInputSeconds(settingsRow?.container_acid_duration_ms ?? defaultRelayDurationMs('acid'))
      );
      setWaterSec(
        durationMsToInputSeconds(settingsRow?.container_water_duration_ms ?? defaultRelayDurationMs('water'))
      );
    }

    load();

    const pollTimer = window.setInterval(async () => {
      if (cancelled) return;
      const { data: st, error: ste } = await supabase
        .from('device_state')
        .select('*')
        .eq('device_id', DEVICE_ID)
        .maybeSingle();
      if (cancelled) return;
      if (ste) return;
      if (st) setState(st as DeviceState);
    }, DEVICE_STATE_POLL_MS);

    const channel = supabase
      .channel('device_state_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'device_state', filter: `device_id=eq.${DEVICE_ID}` },
        (payload) => {
          setState((prev) => mergeDeviceStateRow(prev, payload.new as Record<string, unknown>));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      supabase.removeChannel(channel);
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      setCountdownLabel(null);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setConnectivityTick((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  async function saveSettings() {
    setBusy(true);
    setInfo(null);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('device_settings')
        .upsert(
          {
            device_id: DEVICE_ID,
            cycles_requested: cycles,
            ...durationPayloadFromSeconds(mixerSec, restSec, acidSec, waterSec),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'device_id' }
        )
        .select('*')
        .maybeSingle();
      if (e) throw e;
      setSettings((data as DeviceSettings | null) ?? null);
      setInfo('Saved settings.');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save settings');
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!canRun) return;
    setBusy(true);
    setInfo(null);
    setError(null);
    startCountdown('Run', 10);
    try {
      const run_id = newRunId();
      const { data, error: e } = await supabase
        .from('device_settings')
        .upsert(
          {
            device_id: DEVICE_ID,
            cycles_requested: cycles,
            ...durationPayloadFromSeconds(mixerSec, restSec, acidSec, waterSec),
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
    startCountdown('Stop', 10);
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

  const tdsAnalogRaw = coerceFiniteNumber(state?.tds_analog_raw);
  const tdsDensityGPerMl = coerceFiniteNumber(state?.tds_g_per_ml);

  const heartbeatAge = heartbeatAgeMs(state?.last_heartbeat);
  const cloudReachable =
    heartbeatAge !== null && heartbeatAge >= 0 && heartbeatAge <= HEARTBEAT_ONLINE_MAX_AGE_MS;

  return (
    <div className="space-y-8">
      {countdown > 0 && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-stone-950/80 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Sending command countdown"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-amber-900/40 bg-stone-950 shadow-2xl shadow-black/60">
            <div className="border-b border-stone-800 bg-linear-to-b from-amber-500/10 to-transparent px-6 py-5">
              <p className="text-xs font-medium uppercase tracking-wider text-stone-400">
                Sending command
              </p>
              <h3 className="mt-1 text-2xl font-semibold text-stone-100 sm:text-3xl">
                {countdownLabel ?? 'Run'} in{' '}
                <span className="text-amber-400">{countdown}s</span>
              </h3>
              <p className="mt-2 text-sm text-stone-400">
                Please wait while the command is propagated to the device.
              </p>
            </div>

            <div className="px-6 py-6">
              <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="order-2 sm:order-1">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-stone-800">
                    <div className="h-full origin-left bg-linear-to-r from-amber-500 to-amber-300 motion-safe:animate-[countdown_10s_linear_forwards]" />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-stone-500">
                    <span>0s</span>
                    <span>10s</span>
                  </div>
                </div>

                <div className="order-1 sm:order-2 flex justify-center">
                  <div className="relative grid h-28 w-28 place-items-center rounded-full border border-amber-900/40 bg-amber-500/10 sm:h-32 sm:w-32">
                    <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-stone-800" />
                    <div className="h-24 w-24 rounded-full bg-stone-950/60 sm:h-28 sm:w-28" />
                    <div className="absolute text-3xl font-bold tracking-tight text-amber-300 sm:text-4xl">
                      {countdown}
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-6 text-center text-sm text-stone-500">
                Controls are temporarily locked to avoid double-sending.
              </p>
            </div>
          </div>
        </div>
      )}
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
        <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-stone-500">
          Relay ON time
        </h3>
        <p className="mb-4 text-xs text-stone-600">
          Enter <span className="text-stone-400">seconds</span> here. They are saved to Supabase and sent to the
          device as <span className="text-stone-400">milliseconds</span>. Default seconds are shown under each
          field. Order on the device: acid → water → mixer → rest (rest runs twice).
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="dur-acid" className="block text-xs font-medium text-stone-500">
              Container acid (s)
            </label>
            <input
              id="dur-acid"
              type="number"
              min={1}
              max={86400}
              value={acidSec}
              onChange={(e) => setAcidSec(clampDurationSec(Number(e.target.value)))}
              disabled={controlsDisabled || countdown > 0}
              className="mt-2 w-full rounded-lg border border-stone-700 bg-stone-950/60 px-3 py-2 text-stone-100 outline-none focus:border-amber-600/60"
            />
            <p className="mt-1 text-xs text-stone-600">
              Default: <span className="font-mono text-stone-400">{DEFAULT_RELAY_DURATION_SEC.acid}</span> s
            </p>
          </div>
          <div>
            <label htmlFor="dur-water" className="block text-xs font-medium text-stone-500">
              Container water (s)
            </label>
            <input
              id="dur-water"
              type="number"
              min={1}
              max={86400}
              value={waterSec}
              onChange={(e) => setWaterSec(clampDurationSec(Number(e.target.value)))}
              disabled={controlsDisabled || countdown > 0}
              className="mt-2 w-full rounded-lg border border-stone-700 bg-stone-950/60 px-3 py-2 text-stone-100 outline-none focus:border-amber-600/60"
            />
            <p className="mt-1 text-xs text-stone-600">
              Default: <span className="font-mono text-stone-400">{DEFAULT_RELAY_DURATION_SEC.water}</span> s
            </p>
          </div>
          <div>
            <label htmlFor="dur-mixer" className="block text-xs font-medium text-stone-500">
              Mixer (s)
            </label>
            <input
              id="dur-mixer"
              type="number"
              min={1}
              max={86400}
              value={mixerSec}
              onChange={(e) => setMixerSec(clampDurationSec(Number(e.target.value)))}
              disabled={controlsDisabled || countdown > 0}
              className="mt-2 w-full rounded-lg border border-stone-700 bg-stone-950/60 px-3 py-2 text-stone-100 outline-none focus:border-amber-600/60"
            />
            <p className="mt-1 text-xs text-stone-600">
              Default: <span className="font-mono text-stone-400">{DEFAULT_RELAY_DURATION_SEC.mixer}</span> s
            </p>
          </div>
          <div>
            <label htmlFor="dur-rest" className="block text-xs font-medium text-stone-500">
              Container rest (s)
            </label>
            <input
              id="dur-rest"
              type="number"
              min={1}
              max={86400}
              value={restSec}
              onChange={(e) => setRestSec(clampDurationSec(Number(e.target.value)))}
              disabled={controlsDisabled || countdown > 0}
              className="mt-2 w-full rounded-lg border border-stone-700 bg-stone-950/60 px-3 py-2 text-stone-100 outline-none focus:border-amber-600/60"
            />
            <p className="mt-1 text-xs text-stone-600">
              Default: <span className="font-mono text-stone-400">{DEFAULT_RELAY_DURATION_SEC.rest}</span> s
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-4 border-t border-stone-800 pt-6">
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
              disabled={controlsDisabled || countdown > 0}
              className="mt-2 w-full rounded-lg border border-stone-700 bg-stone-950/60 px-3 py-2 text-stone-100 outline-none focus:border-amber-600/60"
            />
            <p className="mt-2 text-xs text-stone-600">
              The Arduino will run exactly this many full cycles, then stop and wait.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={saveSettings}
              disabled={controlsDisabled}
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
              disabled={controlsDisabled || countdown > 0}
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
          <div
            className={`rounded-lg border p-4 ${
              cloudReachable
                ? 'border-emerald-900/40 bg-emerald-950/15'
                : 'border-stone-800 bg-stone-950/40'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Cloud / internet</p>
            <p className="mt-1 text-lg font-semibold text-stone-100">
              {state == null ? (
                <span className="text-stone-400">No device row</span>
              ) : cloudReachable ? (
                <span className="text-emerald-300">Connected</span>
              ) : (
                <span className="text-amber-300/90">Not connected</span>
              )}
            </p>
            <p className="mt-1 text-xs text-stone-600">
              Inferred from recent updates to Supabase (last seen{' '}
              {heartbeatAge !== null ? formatAgeShort(heartbeatAge) : '—'}). Unplugged WiFi or no route to
              the project shows here after ~1 min.
            </p>
          </div>
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
          <div
            className={`rounded-lg border p-4 ${
              state?.hydrometer_low === true
                ? 'border-red-900/50 bg-red-950/25'
                : 'border-stone-800 bg-stone-950/40'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Hydrometer (A4)</p>
            <p className="mt-1 text-lg font-semibold text-stone-100">
              Raw:{' '}
              <span className="font-mono">
                {state?.hydrometer_raw != null && state?.hydrometer_raw !== undefined
                  ? state.hydrometer_raw
                  : '—'}
              </span>
              {state?.hydrometer_low === true && (
                <span className="ml-3 text-base font-semibold text-red-300">LOW — stop requested</span>
              )}
            </p>
            <p className="mt-1 text-xs text-stone-600">
              Stop + buzzer when raw &lt; 200 (firmware).
            </p>
          </div>
          <div className="rounded-lg border border-stone-800 bg-stone-950/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-stone-500">TDS (A5)</p>
            <div className="mt-1 space-y-1">
              <p className="text-lg font-semibold text-stone-100">
                Raw:{' '}
                <span className="font-mono tabular-nums">
                  {tdsAnalogRaw !== null ? String(Math.round(tdsAnalogRaw)) : '—'}
                </span>
              </p>
              {tdsDensityGPerMl !== null && (
                <p className="text-lg font-semibold text-stone-100">
                  Density:{' '}
                  <span className="font-mono tabular-nums text-stone-300">
                    {tdsDensityGPerMl.toFixed(6)} g/mL
                  </span>
                </p>
              )}
            </div>
            <p className="mt-2 text-xs text-stone-600">
              Analog 0–1023 from the probe; firmware converts to solution density (g/mL) using a calibration point.
              Adjust <span className="font-mono text-stone-500">TDS_RAW_DENSITY_CAL</span> /{' '}
              <span className="font-mono text-stone-500">DENSITY_AT_CAL_G_PER_ML</span> in the sketch if needed.
            </p>
          </div>
          <div
            className={`rounded-lg border p-4 md:col-span-2 ${
              state?.buzzer_alarm === true
                ? 'border-amber-900/50 bg-amber-950/20'
                : 'border-stone-800 bg-stone-950/40'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-stone-500">Buzzer (D2)</p>
            <p className="mt-1 text-lg font-semibold text-stone-100">
              {state?.buzzer_alarm === true ? (
                <span className="text-amber-300">Alarming (hydrometer low)</span>
              ) : (
                <span className="text-stone-400">Quiet</span>
              )}
            </p>
            <p className="mt-1 text-xs text-stone-600">
              Steady ~1 kHz tone while hydrometer is below threshold; stops when raw is above 200 again.
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

