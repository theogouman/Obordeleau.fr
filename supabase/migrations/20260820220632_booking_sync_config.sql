-- Shared secret between the pg_cron schedule and the sync-ical Edge Function.
-- Kept in SQL so both ends read one value that never leaves the database; the
-- Edge Function still prefers a SYNC_SECRET env var when one is present.
create table if not exists public.sync_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.sync_config enable row level security;
revoke all on public.sync_config from anon, authenticated;
