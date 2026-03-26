-- Sulfuric Acid Mixing System - Supabase Schema
--
-- Database setup uses only two files in order:
--   1. clear.sql
--   2. schema.sql (this file)
-- No separate migration scripts. Relay duration defaults (ms) match firmware and dashboard.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_device_heartbeat()
returns trigger
language plpgsql
as $$
begin
  new.last_heartbeat = now();
  return new;
end;
$$;

-- 1. Relay event logs (Arduino inserts one row per relay ON event)
create table public.relay_logs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  relay_name text not null,
  relay_pin text not null,
  sequence_index int not null,
  cycle_number int not null default 1,
  duration_ms int not null,
  created_at timestamptz default now()
);

create index relay_logs_created_at_idx on public.relay_logs (created_at desc);
create index relay_logs_batch_id_idx on public.relay_logs (batch_id);

-- 2. Device control/settings (website writes; Arduino polls)
create table public.device_settings (
  device_id text primary key,
  cycles_requested int not null default 1 check (cycles_requested between 1 and 999),
  run_requested boolean not null default false,
  stop_requested boolean not null default false,
  run_id uuid,
  mixer_duration_ms int not null default 10000 check (mixer_duration_ms between 100 and 86400000),
  container_rest_duration_ms int not null default 110000 check (container_rest_duration_ms between 100 and 86400000),
  container_acid_duration_ms int not null default 100000 check (container_acid_duration_ms between 100 and 86400000),
  container_water_duration_ms int not null default 100000 check (container_water_duration_ms between 100 and 86400000),
  updated_at timestamptz not null default now()
);

create table public.device_state (
  device_id text primary key,
  status text not null default 'offline' check (status in ('offline','idle','running','stopping','error')),
  active_run_id uuid,
  cycles_completed int not null default 0,
  last_error text,
  last_heartbeat timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  hydrometer_raw int,
  hydrometer_low boolean not null default false,
  tds_analog_raw int,
  tds_g_per_ml double precision,
  buzzer_alarm boolean not null default false
);

drop trigger if exists trg_device_settings_updated_at on public.device_settings;
create trigger trg_device_settings_updated_at
before update on public.device_settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_device_state_updated_at on public.device_state;
create trigger trg_device_state_updated_at
before update on public.device_state
for each row execute function public.set_updated_at();

drop trigger if exists trg_device_state_heartbeat on public.device_state;
create trigger trg_device_state_heartbeat
before update on public.device_state
for each row execute function public.set_device_heartbeat();

create index device_state_updated_at_idx on public.device_state (updated_at desc);

-- 3. Realtime (ignore if already registered — e.g. partial re-run)
do $pub$
begin
  alter publication supabase_realtime add table public.relay_logs;
exception
  when duplicate_object then null;
end
$pub$;

do $pub$
begin
  alter publication supabase_realtime add table public.device_state;
exception
  when duplicate_object then null;
end
$pub$;

-- 4. Production cycle summary
create or replace view public.production_cycles as
select
  batch_id,
  min(created_at) as started_at,
  max(created_at) as finished_at
from public.relay_logs
group by batch_id;

-- 5. RLS (drop first so re-apply after clear is predictable)
alter table public.relay_logs enable row level security;
alter table public.device_settings enable row level security;
alter table public.device_state enable row level security;

drop policy if exists "Allow public read on relay_logs" on public.relay_logs;
create policy "Allow public read on relay_logs"
  on public.relay_logs for select using (true);

drop policy if exists "Allow insert for anon (Arduino)" on public.relay_logs;
create policy "Allow insert for anon (Arduino)"
  on public.relay_logs for insert with check (true);

drop policy if exists "Allow public read on device_settings" on public.device_settings;
create policy "Allow public read on device_settings"
  on public.device_settings for select using (true);

drop policy if exists "Allow public insert on device_settings" on public.device_settings;
create policy "Allow public insert on device_settings"
  on public.device_settings for insert with check (true);

drop policy if exists "Allow public update on device_settings" on public.device_settings;
create policy "Allow public update on device_settings"
  on public.device_settings for update using (true) with check (true);

drop policy if exists "Allow public read on device_state" on public.device_state;
create policy "Allow public read on device_state"
  on public.device_state for select using (true);

drop policy if exists "Allow public insert on device_state" on public.device_state;
create policy "Allow public insert on device_state"
  on public.device_state for insert with check (true);

drop policy if exists "Allow public update on device_state" on public.device_state;
create policy "Allow public update on device_state"
  on public.device_state for update using (true) with check (true);

-- Seed default device (idempotent)
insert into public.device_settings (
  device_id,
  cycles_requested,
  run_requested,
  stop_requested,
  mixer_duration_ms,
  container_rest_duration_ms,
  container_acid_duration_ms,
  container_water_duration_ms
)
values (
  'arduino_r4_1',
  1,
  false,
  false,
  10000,
  110000,
  100000,
  100000
)
on conflict (device_id) do update set updated_at = now();

insert into public.device_state (device_id, status, cycles_completed)
values ('arduino_r4_1', 'idle', 0)
on conflict (device_id) do update set updated_at = now();
