-- Wipe Sulfuric objects (step 1 of 2). Next run `schema.sql` in the SQL Editor.
-- Dropping tables removes them from `supabase_realtime` automatically.

begin;

drop view if exists public.production_cycles;
drop table if exists public.relay_logs, public.device_settings, public.device_state cascade;

commit;
