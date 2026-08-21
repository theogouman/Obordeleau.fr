-- Phase 3, lot 3: the stay rules the picker is built on, and the write path
-- that now re-applies them.
--
-- One transaction that always rolls back. Fixture dates sit in 2029, far
-- outside the imported calendars.
--
-- Run it with:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/stay-rules.test.sql

begin;

create temporary table t_result (
  id int generated always as identity, name text not null, passed boolean not null, detail text
) on commit drop;

create function pg_temp.expect(p_name text, p_ok boolean, p_detail text default null)
returns void language sql as $$
  insert into t_result (name, passed, detail) values (p_name, coalesce(p_ok, false), p_detail);
$$;

-- The live config may have no base rate yet, and get_quote refuses to price a
-- night it does not know. One is set here so the tax assertion has something to
-- add to. Rolled back with everything else.
update public.pricing_config set base_nightly_rate = 100.00 where singleton;

do $test$
declare
  v jsonb;
  v_off date := date '2029-05-10';
  v_sat date := date '2029-07-01'
                + ((6 - extract(isodow from date '2029-07-01')::int + 7) % 7);
  v_n int;
begin
  -- S1. What the picker is handed.
  v := public.public_stay_rules();
  perform pg_temp.expect('S1. stay rules carry today, the first arrival and the default minimum',
    (v ->> 'today') is not null
    and (v ->> 'min_arrival')::date = (v ->> 'today')::date + 1
    and (v ->> 'default_min_nights')::int = 2, v::text);

  -- The picker needs the constraints. It has no business knowing the rates.
  perform pg_temp.expect('S1b. the rules leak no price',
    v::text not like '%rate%' and v::text not like '%price%', v::text);

  select count(*) into v_n from jsonb_array_elements(v -> 'seasons');
  perform pg_temp.expect('S1c. only seasons still ahead are sent',
    v_n > 0 and not exists (
      select 1 from jsonb_array_elements(v -> 'seasons') s
       where (s ->> 'end_date')::date <= public.booking_today()), v_n::text);

  perform pg_temp.expect('S1d. a summer season states saturday and the multiple of seven',
    exists (
      select 1 from jsonb_array_elements(v -> 'seasons') s
       where s ->> 'checkin_constraint' = 'saturday'
         and (s ->> 'stay_multiple')::int = 7
         and (s ->> 'min_nights')::int = 7));

  -- S2. The write path refuses exactly what the picker will refuse, because
  --     both now ask validate_stay rather than keeping their own copy.
  v := public.create_direct_reservation('Test', 't@example.invalid', v_off, v_off + 1, 2, null, 'fr', 0);
  perform pg_temp.expect('S2. one night off season is refused by the write path',
    (v ->> 'ok')::boolean is false and v ->> 'reason' = 'min_nights', v::text);

  v := public.create_direct_reservation('Test', 't@example.invalid', v_sat + 3, v_sat + 10, 2, null, 'fr', 0);
  perform pg_temp.expect('S2b. a Tuesday arrival in summer is refused',
    (v ->> 'ok')::boolean is false and v ->> 'reason' = 'checkin_day', v::text);

  v := public.create_direct_reservation('Test', 't@example.invalid', v_sat, v_sat + 10, 2, null, 'fr', 0);
  perform pg_temp.expect('S2c. ten nights in summer is refused as not a whole number of weeks',
    (v ->> 'ok')::boolean is false and v ->> 'reason' = 'stay_multiple', v::text);

  -- S3. And takes what it should, keeping the minors with the stay.
  v := public.create_direct_reservation('Famille', 'f@example.invalid', v_off, v_off + 3, 4, null, 'fr', 2);
  perform pg_temp.expect('S3. two adults and two minors off season is written',
    (v ->> 'ok')::boolean is true, v::text);

  select minors into v_n from public.reservations where guest_email = 'f@example.invalid';
  perform pg_temp.expect('S3b. the minors are stored with the stay', v_n = 2, v_n::text);

  perform pg_temp.expect('S3c. the quote for that stay taxes the two adults only',
    (public.get_quote(v_off, v_off + 3, 2, 2) ->> 'tourist_tax')::numeric = 11.16,
    (public.get_quote(v_off, v_off + 3, 2, 2) ->> 'tourist_tax'));

  -- S4. A party with no adult in it is not a booking.
  v := public.create_direct_reservation('Mineurs', 'm@example.invalid', v_off + 10, v_off + 12, 2, null, 'fr', 2);
  perform pg_temp.expect('S4. as many minors as travellers is refused',
    (v ->> 'ok')::boolean is false and v ->> 'reason' = 'minors', v::text);

  -- S5, S6. A whole number of weeks from a Saturday is taken, and the nights
  --         it took stop being offered.
  v := public.create_direct_reservation('Semaine', 'w@example.invalid', v_sat, v_sat + 14, 3, null, 'fr', 1);
  perform pg_temp.expect('S5. a saturday to saturday fortnight in summer is written',
    (v ->> 'ok')::boolean is true, v::text);

  v := public.validate_stay(v_sat, v_sat + 7);
  perform pg_temp.expect('S6. the nights just taken are no longer available',
    (v ->> 'valid')::boolean is false and v ->> 'reason' = 'unavailable', v::text);
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
    raise exception E'stay rule tests failed:\n%', v_failed;
  end if;
  raise notice 'all % stay rule tests passed', (select count(*) from t_result);
end;
$check$;

rollback;
