-- Phase 3, lot 1: the pricing and stay constraint schema.
--
-- Same conventions as the Phase 2 availability store: every date range is half
-- open, [start_date, end_date), a night is named by the date it starts on, RLS
-- is on with no policy so nothing is reachable from a browser, and every read
-- goes through the service role on the server.
--
-- A price that is not known yet is NULL, never 0 and never a guess. Every path
-- that would charge a guest refuses on a NULL rate (constitution VIII, no half
-- built money paths), so an unconfigured rate produces an error, not a free night.

-- The single row of global pricing settings. `singleton` is a boolean primary
-- key checked true, which is the cheapest way to make a second row impossible.
create table if not exists public.pricing_config (
  singleton boolean primary key default true,
  -- NULL until the owner sets it. Nothing can be quoted before that.
  base_nightly_rate numeric(10,2),
  cleaning_fee numeric(10,2) not null default 0,
  -- Reindexed every January by the TPM, so a config field, never a constant.
  tourist_tax_per_adult_night numeric(10,2) not null default 1.86,
  -- Applied to the accommodation subtotal alone. Lot 4 owns the charge itself.
  deposit_percentage numeric(5,2) not null default 50,
  deposit_charge_days_before_arrival int,
  -- The stay constraint outside every seasonal tier: two nights, any arrival day.
  default_min_nights int not null default 2,
  updated_at timestamptz not null default now(),
  constraint pricing_config_singleton check (singleton),
  constraint pricing_config_base_rate check (base_nightly_rate is null or base_nightly_rate >= 0),
  constraint pricing_config_cleaning check (cleaning_fee >= 0),
  constraint pricing_config_tax check (tourist_tax_per_adult_night >= 0),
  constraint pricing_config_deposit check (deposit_percentage >= 0 and deposit_percentage <= 100),
  constraint pricing_config_charge_days check (
    deposit_charge_days_before_arrival is null or deposit_charge_days_before_arrival >= 0),
  constraint pricing_config_min_nights check (default_min_nights >= 1)
);

-- Layer 2 of the price, and the home of the seasonal stay constraints.
-- Generic on purpose: summer is one row among possible others, not a hard rule.
create table if not exists public.seasonal_tiers (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  start_date date not null,
  end_date date not null,
  nightly_rate numeric(10,2),
  -- A premium season should not be discounted unless the owner says so.
  is_last_minute_exempt boolean not null default true,
  min_nights int not null default 2,
  checkin_constraint text not null default 'any',
  -- 7 for a Saturday to Saturday season. NULL means any length above min_nights.
  stay_multiple int,
  created_at timestamptz not null default now(),
  -- A stable natural key, so seeding a season twice is a no op.
  constraint seasonal_tiers_label_unique unique (label),
  constraint seasonal_tiers_range check (end_date > start_date),
  constraint seasonal_tiers_rate check (nightly_rate is null or nightly_rate >= 0),
  constraint seasonal_tiers_min_nights check (min_nights >= 1),
  constraint seasonal_tiers_checkin check (checkin_constraint in ('any','saturday')),
  constraint seasonal_tiers_multiple check (stay_multiple is null or stay_multiple >= 1),
  -- Tiers never overlap, so a night resolves to exactly one tier or to none.
  -- This is what makes the four layer resolution deterministic without a
  -- priority column to reason about.
  constraint seasonal_tiers_no_overlap exclude using gist (
    (daterange(start_date, end_date, '[)')) with &&
  )
);

-- Layer 3. One tier only, evaluated per night and anchored on today, so the
-- window slides on its own and nothing has to be recomputed on a schedule.
create table if not exists public.last_minute_discount (
  singleton boolean primary key default true,
  enabled boolean not null default false,
  window_days int,
  discounted_price numeric(10,2),
  floor_price numeric(10,2),
  updated_at timestamptz not null default now(),
  constraint last_minute_singleton check (singleton),
  constraint last_minute_window check (window_days is null or window_days >= 0),
  constraint last_minute_prices check (
    (discounted_price is null or discounted_price >= 0)
    and (floor_price is null or floor_price >= 0)),
  -- The toggle cannot be turned on half configured.
  constraint last_minute_complete check (
    not enabled
    or (window_days is not null and discounted_price is not null and floor_price is not null))
);

-- Layer 4. Wins over everything, in both directions: a bank holiday above the
-- tier rate and a favour below it are the same mechanism.
create table if not exists public.price_overrides (
  night date primary key,
  nightly_rate numeric(10,2) not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint price_overrides_rate check (nightly_rate >= 0)
);

comment on table public.pricing_config is
  'Single row of global pricing settings. A NULL rate means the owner has not set it yet; quoting refuses rather than guessing.';
comment on table public.seasonal_tiers is
  'Dated tiers, half open [start_date, end_date). Carries both the seasonal rate and the seasonal stay constraints. Tiers never overlap.';
comment on table public.last_minute_discount is
  'Single row. Sliding window measured from today in Europe/Paris, applied per free night, downwards only, never below floor_price.';
comment on table public.price_overrides is
  'One manual price per night. Beats every other layer in both directions.';

-- Same posture as Phase 2: RLS on, zero policies, nothing reachable from anon.
alter table public.pricing_config       enable row level security;
alter table public.seasonal_tiers       enable row level security;
alter table public.last_minute_discount enable row level security;
alter table public.price_overrides      enable row level security;

revoke all on public.pricing_config, public.seasonal_tiers,
              public.last_minute_discount, public.price_overrides
  from anon, authenticated;
