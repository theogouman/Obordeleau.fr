-- Phase 3, lot 2: the read and write surface the admin console uses.
--
-- The console edits settings. It never computes a price: every figure it draws
-- comes back through `resolve_nightly_prices` from lot 1, so what Corine sees
-- in the calendar is literally what a visitor would be quoted.
--
-- Same posture as everything else here: RLS stays closed, these functions are
-- granted to service_role only, and the browser reaches them through a server
-- action that has already checked the admin session.

-- Everything the general rules form needs, in one read.
create or replace function public.admin_pricing_settings()
returns jsonb
language sql
stable
set search_path = pg_catalog, pg_temp
as $fn$
  select jsonb_build_object(
    'today', public.booking_today(),
    'config', (select to_jsonb(c) from public.pricing_config c where c.singleton),
    'last_minute', (select to_jsonb(d) from public.last_minute_discount d where d.singleton),
    'tiers', coalesce(
      (select jsonb_agg(to_jsonb(t) order by t.start_date) from public.seasonal_tiers t),
      '[]'::jsonb)
  );
$fn$;

-- One row per night for the month on screen: the resolved price, the layer that
-- won it, whether an override sits underneath, and what is holding the night.
create or replace function public.admin_calendar(p_from date, p_to date)
returns table (
  c_night date,
  c_price numeric,
  c_layer text,
  c_override numeric,
  c_busy text,
  c_platform text
)
language sql
stable
set search_path = pg_catalog, pg_temp
as $fn$
  with busy as (
    select b.b_kind, b.b_start, b.b_end, b.b_platform
      from public.busy_ranges(p_from, p_to) b
  )
  select
    n.n_night,
    n.n_price,
    n.n_layer,
    o.nightly_rate,
    h.b_kind,
    h.b_platform
  from public.resolve_nightly_prices(p_from, p_to) n
  left join public.price_overrides o on o.night = n.n_night
  -- A night can be held by more than one source at once. Name the strongest,
  -- because "reserved" and "imported from Airbnb" do not mean the same thing
  -- to the person reading the calendar.
  left join lateral (
    select b.b_kind, b.b_platform
      from busy b
     where n.n_night >= b.b_start and n.n_night < b.b_end
     order by case b.b_kind
                when 'reservation' then 1
                when 'manual' then 2
                else 3
              end
     limit 1
  ) h on true
  order by n.n_night;
$fn$;

-- ---------------------------------------------------------------------------
-- Writes. All of them answer {ok, reason} the way create_direct_reservation
-- does, so the console has one shape to render and one place to translate.
-- ---------------------------------------------------------------------------

create or replace function public.admin_save_pricing_config(
  p_base_nightly_rate numeric,
  p_cleaning_fee numeric,
  p_tourist_tax_per_adult_night numeric,
  p_deposit_percentage numeric,
  p_deposit_charge_days_before_arrival int,
  p_default_min_nights int
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if p_base_nightly_rate is not null and p_base_nightly_rate < 0 then
    return jsonb_build_object('ok', false, 'reason', 'base_nightly_rate');
  end if;
  if p_cleaning_fee is null or p_cleaning_fee < 0 then
    return jsonb_build_object('ok', false, 'reason', 'cleaning_fee');
  end if;
  if p_tourist_tax_per_adult_night is null or p_tourist_tax_per_adult_night < 0 then
    return jsonb_build_object('ok', false, 'reason', 'tourist_tax_per_adult_night');
  end if;
  if p_deposit_percentage is null
     or p_deposit_percentage < 0 or p_deposit_percentage > 100 then
    return jsonb_build_object('ok', false, 'reason', 'deposit_percentage');
  end if;
  if p_deposit_charge_days_before_arrival is not null
     and p_deposit_charge_days_before_arrival < 0 then
    return jsonb_build_object('ok', false, 'reason', 'deposit_charge_days_before_arrival');
  end if;
  if p_default_min_nights is null or p_default_min_nights < 1 then
    return jsonb_build_object('ok', false, 'reason', 'default_min_nights');
  end if;

  update public.pricing_config
     set base_nightly_rate = p_base_nightly_rate,
         cleaning_fee = p_cleaning_fee,
         tourist_tax_per_adult_night = p_tourist_tax_per_adult_night,
         deposit_percentage = p_deposit_percentage,
         deposit_charge_days_before_arrival = p_deposit_charge_days_before_arrival,
         default_min_nights = p_default_min_nights,
         updated_at = now()
   where singleton;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing_row');
  end if;

  return jsonb_build_object('ok', true);
end;
$fn$;

create or replace function public.admin_save_last_minute(
  p_enabled boolean,
  p_window_days int,
  p_discounted_price numeric,
  p_floor_price numeric
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if p_window_days is not null and p_window_days < 0 then
    return jsonb_build_object('ok', false, 'reason', 'window_days');
  end if;
  if p_discounted_price is not null and p_discounted_price < 0 then
    return jsonb_build_object('ok', false, 'reason', 'discounted_price');
  end if;
  if p_floor_price is not null and p_floor_price < 0 then
    return jsonb_build_object('ok', false, 'reason', 'floor_price');
  end if;
  -- The toggle cannot be turned on half configured, which is also a table
  -- constraint; caught here so the console gets a name rather than a stack.
  if coalesce(p_enabled, false)
     and (p_window_days is null or p_discounted_price is null or p_floor_price is null) then
    return jsonb_build_object('ok', false, 'reason', 'incomplete');
  end if;

  update public.last_minute_discount
     set enabled = coalesce(p_enabled, false),
         window_days = p_window_days,
         discounted_price = p_discounted_price,
         floor_price = p_floor_price,
         updated_at = now()
   where singleton;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing_row');
  end if;

  return jsonb_build_object('ok', true);
end;
$fn$;

-- Upsert. A null id inserts, which is how a new season is added without a
-- deploy: nothing in the engine knows that summer is special.
create or replace function public.admin_save_tier(
  p_id uuid,
  p_label text,
  p_start_date date,
  p_end_date date,
  p_nightly_rate numeric,
  p_is_last_minute_exempt boolean,
  p_min_nights int,
  p_checkin_constraint text,
  p_stay_multiple int
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_id uuid;
begin
  if p_label is null or btrim(p_label) = '' then
    return jsonb_build_object('ok', false, 'reason', 'label');
  end if;
  if p_start_date is null or p_end_date is null or p_end_date <= p_start_date then
    return jsonb_build_object('ok', false, 'reason', 'range');
  end if;
  if p_nightly_rate is not null and p_nightly_rate < 0 then
    return jsonb_build_object('ok', false, 'reason', 'nightly_rate');
  end if;
  if p_min_nights is null or p_min_nights < 1 then
    return jsonb_build_object('ok', false, 'reason', 'min_nights');
  end if;
  if p_checkin_constraint is null or p_checkin_constraint not in ('any', 'saturday') then
    return jsonb_build_object('ok', false, 'reason', 'checkin_constraint');
  end if;
  if p_stay_multiple is not null and p_stay_multiple < 1 then
    return jsonb_build_object('ok', false, 'reason', 'stay_multiple');
  end if;

  begin
    if p_id is null then
      insert into public.seasonal_tiers (
        label, start_date, end_date, nightly_rate,
        is_last_minute_exempt, min_nights, checkin_constraint, stay_multiple)
      values (
        btrim(p_label), p_start_date, p_end_date, p_nightly_rate,
        coalesce(p_is_last_minute_exempt, true), p_min_nights,
        p_checkin_constraint, p_stay_multiple)
      returning id into v_id;
    else
      update public.seasonal_tiers
         set label = btrim(p_label),
             start_date = p_start_date,
             end_date = p_end_date,
             nightly_rate = p_nightly_rate,
             is_last_minute_exempt = coalesce(p_is_last_minute_exempt, true),
             min_nights = p_min_nights,
             checkin_constraint = p_checkin_constraint,
             stay_multiple = p_stay_multiple
       where id = p_id
      returning id into v_id;

      if v_id is null then
        return jsonb_build_object('ok', false, 'reason', 'not_found');
      end if;
    end if;
  exception
    when exclusion_violation then
      return jsonb_build_object('ok', false, 'reason', 'overlap');
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'duplicate_label');
  end;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$fn$;

create or replace function public.admin_delete_tier(p_id uuid)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  delete from public.seasonal_tiers where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Overrides
-- ---------------------------------------------------------------------------
--
-- Half open [p_from, p_to), like every other range in the project: the console
-- adds a day to the last night the user clicked. A booked night is skipped
-- rather than written, so an override can never contradict a price already
-- agreed with a guest, and the count comes back so the console can say so.

create or replace function public.admin_set_override(
  p_from date,
  p_to date,
  p_nightly_rate numeric,
  p_reason text default null
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_set int := 0;
  v_skipped int := 0;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    return jsonb_build_object('ok', false, 'reason', 'invalid_range');
  end if;
  -- A fat finger on a year field should not rewrite four hundred nights.
  if (p_to - p_from) > 400 then
    return jsonb_build_object('ok', false, 'reason', 'range_too_long');
  end if;
  if p_nightly_rate is null or p_nightly_rate < 0 then
    return jsonb_build_object('ok', false, 'reason', 'nightly_rate');
  end if;

  with candidate as (
    select (p_from + g)::date as night
      from generate_series(0, (p_to - p_from) - 1) as g
  ),
  busy as (
    select b.b_start, b.b_end from public.busy_ranges(p_from, p_to) b
  ),
  free as (
    select c.night
      from candidate c
     where not exists (
       select 1 from busy b where c.night >= b.b_start and c.night < b.b_end)
  ),
  written as (
    insert into public.price_overrides (night, nightly_rate, reason)
    select f.night, p_nightly_rate, p_reason from free f
    on conflict (night) do update
      set nightly_rate = excluded.nightly_rate,
          reason = excluded.reason
    returning 1
  )
  select
    (select count(*) from written),
    (select count(*) from candidate) - (select count(*) from free)
    into v_set, v_skipped;

  return jsonb_build_object('ok', true, 'nights_set', v_set, 'nights_skipped', v_skipped);
end;
$fn$;

create or replace function public.admin_clear_override(p_from date, p_to date)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_cleared int := 0;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    return jsonb_build_object('ok', false, 'reason', 'invalid_range');
  end if;
  if (p_to - p_from) > 400 then
    return jsonb_build_object('ok', false, 'reason', 'range_too_long');
  end if;

  with removed as (
    delete from public.price_overrides
     where night >= p_from and night < p_to
    returning 1
  )
  select count(*) into v_cleared from removed;

  return jsonb_build_object('ok', true, 'nights_cleared', v_cleared);
end;
$fn$;

-- PostgREST publishes public functions. Only the service role may call these.
revoke all on function public.admin_pricing_settings() from public, anon, authenticated;
revoke all on function public.admin_calendar(date, date) from public, anon, authenticated;
revoke all on function public.admin_save_pricing_config(numeric, numeric, numeric, numeric, int, int)
  from public, anon, authenticated;
revoke all on function public.admin_save_last_minute(boolean, int, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.admin_save_tier(uuid, text, date, date, numeric, boolean, int, text, int)
  from public, anon, authenticated;
revoke all on function public.admin_delete_tier(uuid) from public, anon, authenticated;
revoke all on function public.admin_set_override(date, date, numeric, text)
  from public, anon, authenticated;
revoke all on function public.admin_clear_override(date, date) from public, anon, authenticated;

grant execute on function public.admin_pricing_settings() to service_role;
grant execute on function public.admin_calendar(date, date) to service_role;
grant execute on function public.admin_save_pricing_config(numeric, numeric, numeric, numeric, int, int)
  to service_role;
grant execute on function public.admin_save_last_minute(boolean, int, numeric, numeric) to service_role;
grant execute on function public.admin_save_tier(uuid, text, date, date, numeric, boolean, int, text, int)
  to service_role;
grant execute on function public.admin_delete_tier(uuid) to service_role;
grant execute on function public.admin_set_override(date, date, numeric, text) to service_role;
grant execute on function public.admin_clear_override(date, date) to service_role;
