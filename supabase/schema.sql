-- Sulfuric Acid Mixing System - Supabase Schema
-- Run this in Supabase SQL Editor to create tables and view.

-- Extensions used by this schema
create extension if not exists pgcrypto;

-- Auto-maintain updated_at timestamps
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Auto-maintain last_heartbeat on device_state updates
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
create table if not exists relay_logs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  relay_name text not null,
  relay_pin text not null,
  sequence_index int not null,
  cycle_number int not null default 1,
  duration_ms int not null,
  created_at timestamptz default now()
);

create index if not exists relay_logs_created_at_idx
  on relay_logs (created_at desc);

create index if not exists relay_logs_batch_id_idx
  on relay_logs (batch_id);

-- 2. Device control/settings (website writes; Arduino polls)
create table if not exists device_settings (
  device_id text primary key,
  cycles_requested int not null default 1 check (cycles_requested between 1 and 999),
  run_requested boolean not null default false,
  stop_requested boolean not null default false,
  run_id uuid,
  updated_at timestamptz not null default now()
);

create table if not exists device_state (
  device_id text primary key,
  status text not null default 'offline' check (status in ('offline','idle','running','stopping','error')),
  active_run_id uuid,
  cycles_completed int not null default 0,
  last_error text,
  last_heartbeat timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

create index if not exists device_state_updated_at_idx
  on device_state (updated_at desc);

-- 3. Enable Realtime (required for live dashboard + state updates)
alter publication supabase_realtime add table relay_logs;
alter publication supabase_realtime add table device_state;

-- 4. Production cycle summary (derived view; total products = count of batches)
create or replace view production_cycles as
select
  batch_id,
  min(created_at) as started_at,
  max(created_at) as finished_at
from relay_logs
group by batch_id;

-- Optional: RLS policies (adjust for your auth strategy)
-- For public read-only dashboard with anon key:
alter table relay_logs enable row level security;

create policy "Allow public read on relay_logs"
  on relay_logs for select
  using (true);

create policy "Allow insert for anon (Arduino)"
  on relay_logs for insert
  with check (true);

alter table device_settings enable row level security;
alter table device_state enable row level security;

create policy "Allow public read on device_settings"
  on device_settings for select
  using (true);

create policy "Allow public insert on device_settings"
  on device_settings for insert
  with check (true);

create policy "Allow public update on device_settings"
  on device_settings for update
  using (true)
  with check (true);

create policy "Allow public read on device_state"
  on device_state for select
  using (true);

create policy "Allow public insert on device_state"
  on device_state for insert
  with check (true);

create policy "Allow public update on device_state"
  on device_state for update
  using (true)
  with check (true);

-- Seed a default device row (change device_id as needed)
insert into device_settings (device_id, cycles_requested, run_requested, stop_requested)
values ('arduino_r4_1', 1, false, false)
on conflict (device_id) do update set updated_at = now();

insert into device_state (device_id, status, cycles_completed)
values ('arduino_r4_1', 'idle', 0)
on conflict (device_id) do update set updated_at = now();
