-- Phase 3, lot 1: the price engine and the stay validator.
--
-- Three functions, one job each:
--   resolve_nightly_prices  the four layer resolution, one row per night
--   validate_stay           the stay constraints plus availability, no prices
--   get_quote               the only place a total is ever computed
--
-- Pricing and validation stay apart on purpose. A quote never asks whether the
-- stay is legal, and the validator never looks at a rate.

-- ---------------------------------------------------------------------------
-- Layer resolution
-- ---------------------------------------------------------------------------
--
-- One row per night in [p_from, p_to), each carrying the layer that won:
-- override beats last_minute beats tier beats base.
--
-- `p_today` anchors the last minute window. It defaults to today at the
-- property, which is the only value production ever passes. Being able to hand
-- it a date is what lets the admin preview a future week, and what lets the
-- tests pin the window instead of racing the calendar.
--
-- `n_price` is NULL when the winning layer has no rate configured. The
-- calendar can render that as "price on request"; get_quote refuses outright.
create or replace function public.resolve_nightly_prices(
  p_from date,
  p_to date,
  p_today date default null
)
returns table (n_night date, n_price numeric, n_layer text)
language sql
stable
set search_path = pg_catalog, pg_temp
as $fn$
  with settings as (
    -- Exactly one row, whatever the tables hold: the left join keeps a missing
    -- singleton from silently emptying the whole result.
    select
      coalesce(p_today, public.booking_today()) as today,
      (select c.base_nightly_rate from public.pricing_config c where c.singleton) as base_rate,
      coalesce(d.enabled, false) as lm_enabled,
      d.window_days               as lm_window,
      d.discounted_price          as lm_price,
      d.floor_price               as lm_floor
    from (select 1) as anchor
    left join public.last_minute_discount d on d.singleton
  ),
  nights as (
    select (p_from + g)::date as night
      from generate_series(0, (p_to - p_from) - 1) as g
  ),
  -- Fetched once for the window rather than once per night.
  busy as (
    select b.b_start, b.b_end from public.busy_ranges(p_from, p_to) b
  ),
  layered as (
    select
      n.night,
      o.nightly_rate as override_rate,
      t.id           as tier_id,
      t.nightly_rate as tier_rate,
      coalesce(t.is_last_minute_exempt, false) as tier_exempt,
      s.*,
      exists (select 1 from busy b where n.night >= b.b_start and n.night < b.b_end) as is_busy
    from nights n
    cross join settings s
    left join public.price_overrides o on o.night = n.night
    left join public.seasonal_tiers t
      on daterange(t.start_date, t.end_date, '[)') @> n.night
  ),
  scored as (
    select
      l.*,
      case when l.tier_id is not null then l.tier_rate else l.base_rate end as under_price,
      case when l.tier_id is not null then 'tier' else 'base' end as under_layer,
      -- The floor is the guard rail on this layer: a discounted_price set below
      -- it silently becomes the floor rather than being refused.
      greatest(l.lm_price, l.lm_floor) as lm_effective
    from layered l
  )
  select
    s.night,
    case
      when s.override_rate is not null then s.override_rate
      when s.lm_applies then s.lm_effective
      else s.under_price
    end,
    case
      when s.override_rate is not null then 'override'
      when s.lm_applies then 'last_minute'
      else s.under_layer
    end
  from (
    select
      s.*,
      (
        s.lm_enabled
        and s.lm_price is not null
        and s.lm_floor is not null
        and s.lm_window is not null
        -- A taken night keeps its full price: the discount exists to sell a
        -- gap, and a busy night has nothing to sell.
        and not s.is_busy
        -- Sliding window, measured from today, never from the booking date.
        and s.night >= s.today
        and s.night <= s.today + s.lm_window
        and not s.tier_exempt
        -- Belt and braces: an override short circuits above anyway.
        and s.override_rate is null
        -- Downwards only, and only against a rate we actually know.
        and s.under_price is not null
        and greatest(s.lm_price, s.lm_floor) < s.under_price
      ) as lm_applies
    from scored s
  ) s
  order by s.night;
$fn$;

-- ---------------------------------------------------------------------------
-- Stay validation
-- ---------------------------------------------------------------------------
--
-- Validation only: no rate is read here. Returns {valid, reason} plus whatever
-- detail the caller needs to phrase the refusal, which is the shape
-- create_direct_reservation already uses.
--
-- Constraints are the union of every tier the stay touches, plus the
-- out of tier default when any night falls outside all tiers. A stay that
-- spills from June into July is therefore held to the July rule: the strict
-- reading is the safe one, and a Saturday arrival with a length that is a
-- multiple of seven also lands the departure on a Saturday.
create or replace function public.validate_stay(p_check_in date, p_check_out date)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_min_arrival date := public.booking_today() + 1;
  v_range daterange;
  v_nights int;
  v_min_nights int;
  v_needs_saturday boolean;
  v_multiple int;
  v_has_untiered_night boolean;
begin
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    return jsonb_build_object('valid', false, 'reason', 'invalid_range');
  end if;

  v_nights := p_check_out - p_check_in;
  v_range := daterange(p_check_in, p_check_out, '[)');

  -- No same day booking, exactly as the Phase 2 write path already enforces.
  if p_check_in < v_min_arrival then
    return jsonb_build_object(
      'valid', false, 'reason', 'too_soon', 'min_arrival', v_min_arrival);
  end if;

  select
    coalesce(max(t.min_nights), 0),
    coalesce(bool_or(t.checkin_constraint = 'saturday'), false),
    max(t.stay_multiple)
    into v_min_nights, v_needs_saturday, v_multiple
    from public.seasonal_tiers t
   where daterange(t.start_date, t.end_date, '[)') && v_range;

  select exists (
    select 1
      from generate_series(0, v_nights - 1) as g
     where not exists (
       select 1
         from public.seasonal_tiers t
        where daterange(t.start_date, t.end_date, '[)') @> (p_check_in + g)::date)
  ) into v_has_untiered_night;

  if v_has_untiered_night then
    v_min_nights := greatest(
      v_min_nights,
      coalesce((select c.default_min_nights from public.pricing_config c where c.singleton), 2));
  end if;

  if v_nights < v_min_nights then
    return jsonb_build_object(
      'valid', false, 'reason', 'min_nights', 'min_nights', v_min_nights);
  end if;

  -- isodow: Monday is 1, so Saturday is 6.
  if v_needs_saturday and extract(isodow from p_check_in)::int <> 6 then
    return jsonb_build_object(
      'valid', false, 'reason', 'checkin_day', 'required_checkin_day', 'saturday');
  end if;

  if v_multiple is not null and (v_nights % v_multiple) <> 0 then
    return jsonb_build_object(
      'valid', false, 'reason', 'stay_multiple', 'stay_multiple', v_multiple);
  end if;

  -- Availability last, on the Phase 2 mechanism: confirmed reservations,
  -- manual blocks and imported blocks at once. This is the read side; the
  -- exclusion constraint on reservations is still the last word on a race.
  if exists (select 1 from public.busy_ranges(p_check_in, p_check_out)) then
    return jsonb_build_object('valid', false, 'reason', 'unavailable');
  end if;

  return jsonb_build_object('valid', true, 'reason', null);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- The quote
-- ---------------------------------------------------------------------------
--
-- The single source of every amount. The figure Stripe charges in lot 4 comes
-- from a server side call to this function, never from the browser, and the
-- display in lot 3 comes from the same call. There is no second copy of this
-- arithmetic anywhere in the project.
--
-- Deliberately does not validate the stay: that is validate_stay, called by the
-- date picker and again server side before payment.
create or replace function public.get_quote(
  p_check_in date,
  p_check_out date,
  p_adults int,
  p_minors int default 0
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_nights int;
  v_cleaning numeric(10,2);
  v_tax_rate numeric(10,2);
  v_deposit_pct numeric(5,2);
  v_subtotal numeric(12,2);
  v_tax numeric(12,2);
  v_total numeric(12,2);
  v_deposit numeric(12,2);
  v_rows jsonb;
  v_unpriced int;
begin
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  if p_adults is null or p_adults < 1 then
    raise exception 'invalid_adults' using errcode = '22023';
  end if;
  if p_minors is null or p_minors < 0 then
    raise exception 'invalid_minors' using errcode = '22023';
  end if;

  select c.cleaning_fee, c.tourist_tax_per_adult_night, c.deposit_percentage
    into v_cleaning, v_tax_rate, v_deposit_pct
    from public.pricing_config c
   where c.singleton;

  if not found then
    raise exception 'pricing_not_configured' using errcode = '22023';
  end if;

  select
    jsonb_agg(jsonb_build_object(
      'date', n.n_night, 'resolved_price', n.n_price, 'layer', n.n_layer)
      order by n.n_night),
    coalesce(sum(n.n_price), 0::numeric),
    count(*) filter (where n.n_price is null)
    into v_rows, v_subtotal, v_unpriced
    from public.resolve_nightly_prices(p_check_in, p_check_out) n;

  -- Fail closed. A night whose winning layer has no rate cannot be sold.
  if v_unpriced > 0 then
    raise exception 'pricing_not_configured'
      using errcode = '22023',
            detail = format('%s night(s) in the range have no configured rate', v_unpriced);
  end if;

  v_nights := p_check_out - p_check_in;
  v_subtotal := round(v_subtotal, 2);
  -- Minors under 18 are exempt from the tourist tax, so only adults count.
  v_tax := round(v_tax_rate * p_adults * v_nights, 2);
  v_total := round(v_subtotal + v_cleaning + v_tax, 2);
  -- The deposit bites on the accommodation alone. Cleaning and tax ride in the
  -- balance, which is what lot 4 charges before arrival.
  v_deposit := round(v_subtotal * v_deposit_pct / 100, 2);

  return jsonb_build_object(
    'check_in', p_check_in,
    'check_out', p_check_out,
    'nights_count', v_nights,
    'adults', p_adults,
    'minors', p_minors,
    'nights', coalesce(v_rows, '[]'::jsonb),
    'accommodation_subtotal', v_subtotal,
    'cleaning_fee', v_cleaning,
    'tourist_tax', v_tax,
    'total', v_total,
    'deposit_percentage', v_deposit_pct,
    'deposit_amount', v_deposit,
    'balance_amount', round(v_total - v_deposit, 2),
    'currency', 'EUR'
  );
end;
$fn$;

-- PostgREST publishes public functions. Only the service role may call these.
revoke all on function public.resolve_nightly_prices(date, date, date)
  from public, anon, authenticated;
revoke all on function public.validate_stay(date, date) from public, anon, authenticated;
revoke all on function public.get_quote(date, date, int, int) from public, anon, authenticated;

grant execute on function public.resolve_nightly_prices(date, date, date) to service_role;
grant execute on function public.validate_stay(date, date) to service_role;
grant execute on function public.get_quote(date, date, int, int) to service_role;
