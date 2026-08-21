-- Phase 3, lot 2: acceptance tests for the admin read and write surface.
--
-- Same shape as pricing.test.sql: one transaction that always rolls back, and
-- fixture dates in 2029 so no imported calendar can interfere.
--
-- Run it with:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pricing-admin.test.sql

begin;

create temporary table t_result (
  id int generated always as identity,
  name text not null,
  passed boolean not null,
  detail text
) on commit drop;

create function pg_temp.expect(p_name text, p_ok boolean, p_detail text default null)
returns void language sql as $$
  insert into t_result (name, passed, detail) values (p_name, coalesce(p_ok, false), p_detail);
$$;

update public.pricing_config
   set base_nightly_rate = 100.00, cleaning_fee = 0, tourist_tax_per_adult_night = 1.86,
       deposit_percentage = 50, deposit_charge_days_before_arrival = null, default_min_nights = 2
 where singleton;

delete from public.price_overrides;
delete from public.seasonal_tiers;

insert into public.seasonal_tiers (
  label, start_date, end_date, nightly_rate,
  is_last_minute_exempt, min_nights, checkin_constraint, stay_multiple)
values ('test-summer-2029', date '2029-07-01', date '2029-09-01', 130.00, true, 7, 'saturday', 7);

update public.last_minute_discount
   set enabled = false, window_days = null, discounted_price = null, floor_price = null
 where singleton;

insert into public.manual_blocks (start_date, end_date, reason)
values (date '2029-05-20', date '2029-05-23', 'admin test fixture');

insert into public.reservations (guest_name, guest_email, start_date, end_date)
values ('Test', 'test@example.invalid', date '2029-06-10', date '2029-06-13');

do $test$
declare
  v jsonb;
  v_tier uuid;
  v_price numeric;
  v_layer text;
  v_busy text;
  v_over numeric;
  v_n int;
begin
  select id into v_tier from public.seasonal_tiers where label = 'test-summer-2029';

  -- A1. The settings read the general rules form is built on.
  v := public.admin_pricing_settings();
  perform pg_temp.expect('A1. settings carry today, config, last_minute and tiers',
    (v ->> 'today') is not null
    and (v -> 'config' ->> 'base_nightly_rate')::numeric = 100.00
    and (v -> 'last_minute' ->> 'enabled')::boolean is false
    and jsonb_array_length(v -> 'tiers') = 1
    and (v -> 'tiers' -> 0 ->> 'label') = 'test-summer-2029', v::text);

  -- A2. One row per night of the month, with the source of each hold.
  select count(*) into v_n from public.admin_calendar(date '2029-05-01', date '2029-06-01');
  perform pg_temp.expect('A2. the calendar returns one row per night of May',
    v_n = 31, v_n::text);

  select count(*) into v_n from public.admin_calendar(date '2029-05-01', date '2029-06-01')
   where c_busy = 'manual';
  perform pg_temp.expect('A2b. the three blocked nights are named manual',
    v_n = 3, v_n::text);

  select c_busy into v_busy from public.admin_calendar(date '2029-06-01', date '2029-07-01')
   where c_night = date '2029-06-11';
  perform pg_temp.expect('A2c. a confirmed reservation is named as one',
    v_busy = 'reservation', coalesce(v_busy, 'null'));

  select c_price, c_layer, c_busy into v_price, v_layer, v_busy
    from public.admin_calendar(date '2029-05-01', date '2029-06-01')
   where c_night = date '2029-05-05';
  perform pg_temp.expect('A2d. a free off season night shows the base rate',
    v_price = 100.00 and v_layer = 'base' and v_busy is null,
    format('%s / %s / %s', v_price, v_layer, coalesce(v_busy, 'free')));

  -- A3. An override never lands on a night that is already taken.
  v := public.admin_set_override(date '2029-05-18', date '2029-05-22', 150.00, 'test');
  perform pg_temp.expect('A3. setting an override skips the booked nights',
    (v ->> 'ok')::boolean is true
    and (v ->> 'nights_set')::int = 2
    and (v ->> 'nights_skipped')::int = 2, v::text);

  -- A4. And the calendar shows it, with the layer named.
  select c_price, c_layer, c_override into v_price, v_layer, v_over
    from public.admin_calendar(date '2029-05-01', date '2029-06-01')
   where c_night = date '2029-05-18';
  perform pg_temp.expect('A4. the overridden night reads 150 with its layer and its raw value',
    v_price = 150.00 and v_layer = 'override' and v_over = 150.00,
    format('%s / %s / %s', v_price, v_layer, v_over));

  select c_layer into v_layer from public.admin_calendar(date '2029-05-01', date '2029-06-01')
   where c_night = date '2029-05-20';
  perform pg_temp.expect('A4b. the skipped booked night kept its automatic price',
    v_layer = 'base', v_layer);

  -- A5. Clearing restores the automatic price.
  v := public.admin_clear_override(date '2029-05-18', date '2029-05-20');
  select c_price, c_layer, c_override into v_price, v_layer, v_over
    from public.admin_calendar(date '2029-05-01', date '2029-06-01')
   where c_night = date '2029-05-18';
  perform pg_temp.expect('A5. clearing an override restores the resolved price',
    (v ->> 'nights_cleared')::int = 2
    and v_price = 100.00 and v_layer = 'base' and v_over is null,
    format('%s | %s / %s / %s', v::text, v_price, v_layer, v_over));

  -- A6, A7. The config form validates, then moves the calendar.
  v := public.admin_save_pricing_config(100.00, 0, 1.86, 150, null, 2);
  perform pg_temp.expect('A6. a deposit over one hundred percent is refused by name',
    (v ->> 'ok')::boolean is false and v ->> 'reason' = 'deposit_percentage', v::text);

  v := public.admin_save_pricing_config(110.00, 25.00, 1.86, 50, 14, 3);
  select c_price into v_price from public.admin_calendar(date '2029-05-01', date '2029-06-01')
   where c_night = date '2029-05-05';
  perform pg_temp.expect('A7. changing the base rate changes the resolved price',
    (v ->> 'ok')::boolean is true and v_price = 110.00,
    format('%s | %s', v::text, v_price));

  -- A8, A9. The toggle cannot be turned on half configured.
  v := public.admin_save_last_minute(true, null, null, null);
  perform pg_temp.expect('A8. enabling the discount without its three values is refused',
    (v ->> 'ok')::boolean is false and v ->> 'reason' = 'incomplete', v::text);

  v := public.admin_save_last_minute(true, 7, 80.00, 70.00);
  perform pg_temp.expect('A9. a complete discount saves',
    (v ->> 'ok')::boolean is true, v::text);

  -- A10, A11, A12. Tiers.
  v := public.admin_save_tier(null, 'clash', date '2029-08-01', date '2029-10-01',
                              140.00, true, 7, 'saturday', 7);
  perform pg_temp.expect('A10. a tier overlapping another is refused',
    (v ->> 'ok')::boolean is false and v ->> 'reason' = 'overlap', v::text);

  v := public.admin_save_tier(v_tier, 'test-summer-2029', date '2029-07-01', date '2029-09-01',
                              175.00, true, 7, 'saturday', 7);
  select c_price, c_layer into v_price, v_layer
    from public.admin_calendar(date '2029-07-01', date '2029-08-01')
   where c_night = date '2029-07-10';
  perform pg_temp.expect('A11. editing the season rate moves every night of that season',
    (v ->> 'ok')::boolean is true and v_price = 175.00 and v_layer = 'tier',
    format('%s | %s / %s', v::text, v_price, v_layer));

  v := public.admin_delete_tier('00000000-0000-0000-0000-000000000000'::uuid);
  perform pg_temp.expect('A12. deleting a tier that is not there says so',
    (v ->> 'ok')::boolean is false and v ->> 'reason' = 'not_found', v::text);

  -- A13. Guard rails on the range.
  v := public.admin_set_override(date '2029-05-01', date '2031-05-01', 90.00, null);
  perform pg_temp.expect('A13. an absurdly long override range is refused',
    (v ->> 'ok')::boolean is false and v ->> 'reason' = 'range_too_long', v::text);

  v := public.admin_set_override(date '2029-05-05', date '2029-05-05', 90.00, null);
  perform pg_temp.expect('A13b. an empty range is refused',
    (v ->> 'ok')::boolean is false and v ->> 'reason' = 'invalid_range', v::text);

  -- A14. An override still wins inside an exempt season, which is the escape
  --      hatch the console offers for a bank holiday week.
  v := public.admin_set_override(date '2029-07-10', date '2029-07-11', 220.00, null);
  select c_price, c_layer into v_price, v_layer
    from public.admin_calendar(date '2029-07-01', date '2029-08-01')
   where c_night = date '2029-07-10';
  perform pg_temp.expect('A14. an override beats the summer tier',
    v_price = 220.00 and v_layer = 'override', format('%s / %s', v_price, v_layer));
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
    raise exception E'admin tests failed:\n%', v_failed;
  end if;
  raise notice 'all % admin tests passed', (select count(*) from t_result);
end;
$check$;

rollback;
