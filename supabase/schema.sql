-- Sulfuric Acid Mixing System - Supabase Schema
-- Run this in Supabase SQL Editor to create tables and view.

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

-- 2. Enable Realtime for relay_logs (required for live dashboard)
alter publication supabase_realtime add table relay_logs;

-- 3. Production cycle summary (derived view; total products = count of batches)
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
