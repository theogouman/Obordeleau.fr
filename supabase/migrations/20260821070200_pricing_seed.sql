-- Phase 3, lot 1: the rows the engine needs to exist, and only the values the
-- brief actually settles.
--
-- What is known is seeded: cleaning is offered, the tourist tax is the TPM
-- rate for a three star classified rental in force on 01/01/2025, the deposit
-- is half, the minimum stay outside the tiers is two nights, and July and
-- August run Saturday to Saturday.
--
-- What is not known stays NULL rather than becoming a plausible looking number:
--   pricing_config.base_nightly_rate
--   pricing_config.deposit_charge_days_before_arrival
--   seasonal_tiers.nightly_rate for every summer
--   the three last minute discount settings
-- Until the owner fills those in, get_quote raises `pricing_not_configured`
-- instead of quoting, which is the behaviour we want from a money path that is
-- not finished (constitution I and VIII).

insert into public.pricing_config (singleton) values (true)
on conflict (singleton) do nothing;

insert into public.last_minute_discount (singleton) values (true)
on conflict (singleton) do nothing;

-- July and August, one row per year, generic rows in a generic table: nothing
-- about summer is special cased in any function. Add a year with one insert,
-- change a season by editing its row.
insert into public.seasonal_tiers (
  label, start_date, end_date, nightly_rate,
  is_last_minute_exempt, min_nights, checkin_constraint, stay_multiple)
select
  'summer-' || y,
  make_date(y, 7, 1),
  make_date(y, 9, 1),
  null,
  -- The high season is not discounted.
  true,
  -- A Saturday to Saturday season cannot be shorter than a week, and the
  -- multiple of seven with a Saturday arrival puts the departure on a Saturday
  -- too. There is no upper bound on purpose.
  7,
  'saturday',
  7
from generate_series(2026, 2032) as y
on conflict (label) do nothing;
