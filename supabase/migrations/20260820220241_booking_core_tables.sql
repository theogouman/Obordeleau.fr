-- Phase 2 availability store. Every date range is half open, [start_date, end_date):
-- the checkout day is free for the next arrival.

create table if not exists public.ical_sources (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('airbnb','booking')),
  url text not null,
  active boolean not null default true,
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status in ('ok','error')),
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.external_blocks (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('airbnb','booking')),
  uid text not null,
  summary text,
  start_date date not null,
  end_date date not null,
  last_seen_at timestamptz not null default now(),
  constraint external_blocks_range check (end_date > start_date),
  constraint external_blocks_identity unique (platform, uid, start_date)
);

create index if not exists external_blocks_range_idx
  on public.external_blocks using gist (daterange(start_date, end_date, '[)'));
create index if not exists external_blocks_platform_seen_idx
  on public.external_blocks (platform, last_seen_at);

create table if not exists public.manual_blocks (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint manual_blocks_range check (end_date > start_date)
);

create index if not exists manual_blocks_range_idx
  on public.manual_blocks using gist (daterange(start_date, end_date, '[)'));

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'direct',
  guest_name text not null,
  guest_email text not null,
  party_size int check (party_size is null or party_size > 0),
  start_date date not null,
  end_date date not null,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  notes text,
  locale text,
  created_at timestamptz not null default now(),
  constraint reservations_range check (end_date > start_date),
  -- The single source of truth for collision safety (constitution VIII). Two
  -- concurrent direct bookings for the same nights: exactly one commits.
  constraint reservations_no_overlap exclude using gist (
    (daterange(start_date, end_date, '[)')) with &&
  ) where (status = 'confirmed')
);

create index if not exists reservations_confirmed_range_idx
  on public.reservations using gist (daterange(start_date, end_date, '[)'))
  where status = 'confirmed';

-- RLS on, zero policies: nothing is reachable from a browser. Every read and
-- write goes through the service role on the server.
alter table public.ical_sources   enable row level security;
alter table public.external_blocks enable row level security;
alter table public.manual_blocks   enable row level security;
alter table public.reservations    enable row level security;

revoke all on public.ical_sources, public.external_blocks, public.manual_blocks, public.reservations
  from anon, authenticated;
