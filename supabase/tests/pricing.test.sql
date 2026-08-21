-- Phase 3, lot 1: acceptance tests for the price engine and the stay validator.
--
-- Runs inside one transaction that always rolls back, so it can be pointed at
-- any environment, including production, without leaving a row behind.
--
-- Two things make it deterministic instead of dependent on the day it runs:
--   * every fixture date sits in 2029, far outside the imported calendars, so
--     no feed can quietly block a night the test needs free (checked first);
--   * the last minute window is anchored with `resolve_nightly_prices`'s
--     `p_today` argument rather than by waiting for the calendar to catch up.
--
-- Run it with:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pricing.test.sql

begin;

create temporary table t_result (
  id int generated always as identity,
  name text not null,
  passed boolean not null,
  detail text
) on commit drop;

create function pg_temp.expect(p_name text, p_ok boolean, p_detail text default null)
returns void
language sql
as $$
  insert into t_result (name, passed, detail)
  values (p_name, coalesce(p_ok, false), p_detail);
$$;

-- ---------------------------------------------------------------------------
-- Fixtures. Everything below is rolled back.
-- ---------------------------------------------------------------------------

update public.pricing_config
   set base_nightly_rate = 100.00,
       cleaning_fee = 0,
       tourist_tax_per_adult_night = 1.86,
       deposit_percentage = 50,
       default_min_nights = 2
 where singleton;

delete from public.price_overrides;
delete from public.seasonal_tiers;

-- One tier, shaped exactly like the seeded summers but with a rate on it.
insert into public.seasonal_tiers (
  label, start_date, end_date, nightly_rate,
  is_last_minute_exempt, min_nights, checkin_constraint, stay_multiple)
values ('test-summer-2029', date '2029-07-01', date '2029-09-01', 130.00,
        true, 7, 'saturday', 7);

update public.last_minute_discount
   set enabled = true, window_days = 7, discounted_price = 80.00, floor_price = 70.00
 where singleton;

-- The stay the availability test must collide with.
insert into public.manual_blocks (start_date, end_date, reason)
values (date '2029-05-20', date '2029-05-23', 'pricing test fixture');

do $test$
declare
  -- An ordinary night outside every tier.
  v_off  date := date '2029-05-10';
  -- The first Saturday of the 2029 season, computed rather than trusted.
  v_sat  date := date '2029-07-01'
                 + ((6 - extract(isodow from date '2029-07-01')::int + 7) % 7);
  v_price numeric;
  v_layer text;
  v_q jsonb;
  v_v jsonb;
  v_raised text;
begin
  -- 0. The fixture window really is free, otherwise every "free night" case
  --    below would be testing the wrong thing.
  perform pg_temp.expect(
    '0. fixture window 2029-05-01..2029-07-31 is free',
    not exists (select 1 from public.busy_ranges(date '2029-05-01', date '2029-07-31')
                 where b_kind <> 'manual'));
  perform pg_temp.expect(
    '0b. the computed season Saturday really is a Saturday',
    extract(isodow from v_sat)::int = 6, v_sat::text);

  -- 1. Ordinary off season night falls through to the base rate.
  select n_price, n_layer into v_price, v_layer
    from public.resolve_nightly_prices(v_off, v_off + 1, v_off - 60);
  perform pg_temp.expect('1. off season night is the base rate',
    v_price = 100.00 and v_layer = 'base', format('%s / %s', v_price, v_layer));

  -- 2. A July night takes the seasonal tier.
  select n_price, n_layer into v_price, v_layer
    from public.resolve_nightly_prices(v_sat, v_sat + 1, v_sat - 60);
  perform pg_temp.expect('2. July night is the summer tier rate',
    v_price = 130.00 and v_layer = 'tier', format('%s / %s', v_price, v_layer));

  -- 3. Free night three days out, toggle on, outside the exempt tier.
  select n_price, n_layer into v_price, v_layer
    from public.resolve_nightly_prices(v_off, v_off + 1, v_off - 3);
  perform pg_temp.expect('3. free night at T+3 takes the last minute price',
    v_price = 80.00 and v_layer = 'last_minute', format('%s / %s', v_price, v_layer));

  -- 4. The same night twenty days out is simply outside the window.
  select n_price, n_layer into v_price, v_layer
    from public.resolve_nightly_prices(v_off, v_off + 1, v_off - 20);
  perform pg_temp.expect('4. the same night at T+20 is full price',
    v_price = 100.00 and v_layer = 'base', format('%s / %s', v_price, v_layer));

  -- 5. A discounted price set under the floor becomes the floor.
  update public.last_minute_discount set discounted_price = 60.00 where singleton;
  select n_price, n_layer into v_price, v_layer
    from public.resolve_nightly_prices(v_off, v_off + 1, v_off - 3);
  perform pg_temp.expect('5. a discount under the floor is lifted to the floor',
    v_price = 70.00 and v_layer = 'last_minute', format('%s / %s', v_price, v_layer));
  update public.last_minute_discount set discounted_price = 80.00 where singleton;

  -- 6. Summer is exempt, so the same three day window changes nothing.
  select n_price, n_layer into v_price, v_layer
    from public.resolve_nightly_prices(v_sat, v_sat + 1, v_sat - 3);
  perform pg_temp.expect('6. an exempt summer night is never discounted',
    v_price = 130.00 and v_layer = 'tier', format('%s / %s', v_price, v_layer));

  -- 7. An override wins even where the last minute price would have applied.
  insert into public.price_overrides (night, nightly_rate, reason)
  values (v_off, 120.00, 'test');
  select n_price, n_layer into v_price, v_layer
    from public.resolve_nightly_prices(v_off, v_off + 1, v_off - 3);
  perform pg_temp.expect('7. an override beats the last minute layer',
    v_price = 120.00 and v_layer = 'override', format('%s / %s', v_price, v_layer));

  -- 7b. And upwards over a tier, which is the bank holiday case.
  insert into public.price_overrides (night, nightly_rate, reason)
  values (v_sat, 190.00, 'test');
  select n_price, n_layer into v_price, v_layer
    from public.resolve_nightly_prices(v_sat, v_sat + 1, v_sat - 60);
  perform pg_temp.expect('7b. an override above the tier rate wins too',
    v_price = 190.00 and v_layer = 'override', format('%s / %s', v_price, v_layer));

  delete from public.price_overrides;

  -- 8. Family quote: two adults and two minors, three off season nights.
  --    get_quote is anchored on the real today, and 2029 is far outside any
  --    last minute window, so all three nights are the base rate.
  v_q := public.get_quote(v_off, v_off + 3, 2, 2);
  perform pg_temp.expect('8. tourist tax counts adults only',
    (v_q ->> 'tourist_tax')::numeric = 11.16, v_q ->> 'tourist_tax');
  perform pg_temp.expect('8b. accommodation subtotal is the sum of the nights',
    (v_q ->> 'accommodation_subtotal')::numeric = 300.00,
    v_q ->> 'accommodation_subtotal');
  perform pg_temp.expect('8c. cleaning is exposed as zero',
    (v_q ->> 'cleaning_fee')::numeric = 0, v_q ->> 'cleaning_fee');
  perform pg_temp.expect('8d. total is accommodation plus cleaning plus tax',
    (v_q ->> 'total')::numeric = 311.16, v_q ->> 'total');
  perform pg_temp.expect('8e. one entry per night, each with its layer',
    jsonb_array_length(v_q -> 'nights') = 3
    and (v_q -> 'nights' -> 0 ->> 'layer') = 'base'
    and (v_q -> 'nights' -> 0 ->> 'date') = v_off::text,
    v_q ->> 'nights');
  perform pg_temp.expect('8f. currency is EUR', v_q ->> 'currency' = 'EUR');

  -- 9. Stay constraints.
  v_v := public.validate_stay(v_off, v_off + 1);
  perform pg_temp.expect('9a. one night off season is below the minimum',
    (v_v ->> 'valid')::boolean is false and v_v ->> 'reason' = 'min_nights', v_v::text);

  v_v := public.validate_stay(v_sat + 3, v_sat + 10);
  perform pg_temp.expect('9b. summer Tuesday to Tuesday is refused on the arrival day',
    (v_v ->> 'valid')::boolean is false and v_v ->> 'reason' = 'checkin_day', v_v::text);

  v_v := public.validate_stay(v_sat, v_sat + 10);
  perform pg_temp.expect('9c. summer Saturday plus ten nights is not a whole number of weeks',
    (v_v ->> 'valid')::boolean is false and v_v ->> 'reason' = 'stay_multiple', v_v::text);

  v_v := public.validate_stay(v_sat, v_sat + 14);
  perform pg_temp.expect('9d. summer Saturday plus fourteen nights is valid',
    (v_v ->> 'valid')::boolean is true and v_v ->> 'reason' is null, v_v::text);

  v_v := public.validate_stay(v_off, v_off + 2);
  perform pg_temp.expect('9e. two nights off season is valid, any arrival day',
    (v_v ->> 'valid')::boolean is true, v_v::text);

  -- 10. Availability, on the Phase 2 mechanism.
  v_v := public.validate_stay(date '2029-05-19', date '2029-05-22');
  perform pg_temp.expect('10. a stay overlapping a block is unavailable',
    (v_v ->> 'valid')::boolean is false and v_v ->> 'reason' = 'unavailable', v_v::text);

  -- 11. Deposit and balance.
  perform pg_temp.expect('11a. the deposit is half the accommodation subtotal',
    (v_q ->> 'deposit_amount')::numeric = 150.00, v_q ->> 'deposit_amount');
  perform pg_temp.expect('11b. the balance is the total less the deposit',
    (v_q ->> 'balance_amount')::numeric = 161.16, v_q ->> 'balance_amount');
  perform pg_temp.expect('11c. the whole tourist tax sits in the balance',
    (v_q ->> 'balance_amount')::numeric
      = (v_q ->> 'total')::numeric - (v_q ->> 'deposit_amount')::numeric
    and (v_q ->> 'deposit_amount')::numeric
      = round((v_q ->> 'accommodation_subtotal')::numeric * 50 / 100, 2));

  -- 12. Fail closed: a night whose winning layer has no rate cannot be quoted.
  update public.seasonal_tiers set nightly_rate = null where label = 'test-summer-2029';
  begin
    v_q := public.get_quote(v_sat, v_sat + 7, 2, 0);
    v_raised := null;
  exception when others then
    v_raised := sqlerrm;
  end;
  perform pg_temp.expect('12. an unconfigured rate refuses to quote',
    v_raised = 'pricing_not_configured', coalesce(v_raised, 'no error raised'));
  update public.seasonal_tiers set nightly_rate = 130.00 where label = 'test-summer-2029';

  -- 13. Structural guards on the quote arguments.
  begin
    v_q := public.get_quote(v_off + 1, v_off, 2, 0);
    v_raised := null;
  exception when others then
    v_raised := sqlerrm;
  end;
  perform pg_temp.expect('13a. a backwards range is refused',
    v_raised = 'invalid_range', coalesce(v_raised, 'no error raised'));

  begin
    v_q := public.get_quote(v_off, v_off + 2, 0, 2);
    v_raised := null;
  exception when others then
    v_raised := sqlerrm;
  end;
  perform pg_temp.expect('13b. a party with no adult is refused',
    v_raised = 'invalid_adults', coalesce(v_raised, 'no error raised'));
end;
$test$;

select id, case when passed then 'pass' else 'FAIL' end as status, name, detail
  from t_result order by id;

do $check$
declare v_failed text;
begin
  select string_agg(format('  %s  [%s]', name, coalesce(detail, '')), E'\n' order by id)
    into v_failed from t_result where not passed;
  if v_failed is not null then
    raise exception E'pricing tests failed:\n%', v_failed;
  end if;
  raise notice 'all % pricing tests passed', (select count(*) from t_result);
end;
$check$;

rollback;
