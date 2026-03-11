-- Clear all Sulfuric dashboard tables/views (safe re-run)
-- Run this FIRST if you want to wipe everything.

begin;

-- Realtime publication cleanup (ignore errors if table not present)
do $$
begin
  begin
    alter publication supabase_realtime drop table public.relay_logs;
  exception when others then
    null;
  end;
  begin
    alter publication supabase_realtime drop table public.device_state;
  exception when others then
    null;
  end;
end $$;

drop view if exists public.production_cycles;
drop table if exists public.relay_logs;
drop table if exists public.device_settings;
drop table if exists public.device_state;

commit;

