-- Phase 3, lot 5: the shared secret, read back by the side that has to check it.
--
-- The cron job sends it in a header, and the site has to compare. Keeping it in
-- `sync_config` rather than in an environment variable is the Phase 2 posture:
-- generated inside the database, never copied by hand, rotatable with one
-- update and no deploy. This is the read side, service role only, and it hands
-- back one key rather than the table.
create or replace function public.runner_secret(p_key text)
returns text
language sql
stable
set search_path = pg_catalog, pg_temp
as $fn$
  select c.value from public.sync_config c where c.key = p_key;
$fn$;

revoke all on function public.runner_secret(text) from public, anon, authenticated;
grant execute on function public.runner_secret(text) to service_role;
