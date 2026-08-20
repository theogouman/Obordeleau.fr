-- Pre-existing helper behind the `ensure_rls` event trigger. It is SECURITY
-- DEFINER and sits in `public`, so PostgREST advertises it to anon. An
-- event_trigger function cannot actually be called that way, but the grant has
-- no purpose either: event triggers fire as their owner, not as the caller.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
