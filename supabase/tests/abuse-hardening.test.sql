-- Abuse hardening: the shared rate limiter and the cap on concurrent holds.
--
-- One transaction that always rolls back, so it leaves no reservation, no
-- payment and no rate-limit row behind and can be pointed at any environment.
-- Fixture dates sit in February 2029, off season, so the stay rule is two
-- nights minimum with any arrival day, and non-overlapping ranges are used so
-- the exclusion constraint never fires first and masks the cap under test.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/abuse-hardening.test.sql

begin;

create temporary table t_result (n int generated always as identity, name text, pass boolean, detail text)
  on commit drop;

create or replace function pg_temp.check_that(p_name text, p_pass boolean, p_detail text default null)
returns void language sql as $$
  insert into t_result (name, pass, detail) values (p_name, p_pass, p_detail);
$$;

do $suite$
declare
  v jsonb;
  v_first date := date '2029-02-05';
  v_ip text := 'test-ip-' || gen_random_uuid()::text;
  v_email text := 'capper-' || gen_random_uuid()::text || '@example.test';
  v_start date;
  v_r jsonb;
begin
  ------------------------------------------------------------- the rate limiter
  -- A budget of 3 in a long window: the first three pass, the fourth is over.
  v := public.rate_limit_hit('test-bucket:' || v_ip, 3, 3600);
  perform pg_temp.check_that('1 first hit is under budget',
    not (v ->> 'limited')::boolean and (v ->> 'hits')::int = 1, v::text);

  v := public.rate_limit_hit('test-bucket:' || v_ip, 3, 3600);
  v := public.rate_limit_hit('test-bucket:' || v_ip, 3, 3600);
  perform pg_temp.check_that('2 third hit is still under budget',
    not (v ->> 'limited')::boolean and (v ->> 'hits')::int = 3, v::text);

  v := public.rate_limit_hit('test-bucket:' || v_ip, 3, 3600);
  perform pg_temp.check_that('3 the fourth hit is over budget',
    (v ->> 'limited')::boolean and (v ->> 'hits')::int = 4
      and (v ->> 'retry_after_seconds')::int > 0, v::text);

  -- A different caller has its own count and is untouched by the one above.
  v := public.rate_limit_hit('test-bucket:other-' || v_ip, 3, 3600);
  perform pg_temp.check_that('4 a different key keeps its own count',
    not (v ->> 'limited')::boolean and (v ->> 'hits')::int = 1, v::text);

  -- A window in the past is reset in place: the next hit counts as one, not two.
  update public.rate_limit_hits
     set window_started_at = now() - interval '10 minutes'
   where bucket = 'test-bucket:' || v_ip;
  v := public.rate_limit_hit('test-bucket:' || v_ip, 3, 60);
  perform pg_temp.check_that('5 a rolled-over window starts a fresh count',
    not (v ->> 'limited')::boolean and (v ->> 'hits')::int = 1, v::text);

  ------------------------------------------------------------- the hold cap
  -- Three non-overlapping holds from one address, cap of three: all three take.
  for i in 0..2 loop
    v_start := v_first + (i * 10);
    v_r := public.create_direct_reservation(
      'Capper', v_email, v_start, v_start + 3, 2, null, 'fr', 0, 25, v_ip, 3);
    perform pg_temp.check_that(
      format('6.%s hold %s of the allowance is granted', i + 1, i + 1),
      (v_r ->> 'ok')::boolean and v_r ->> 'status' = 'hold', v_r::text);
  end loop;

  -- The fourth, on a fresh week nobody else holds, is refused by the cap alone.
  v_start := v_first + 40;
  v_r := public.create_direct_reservation(
    'Capper', v_email, v_start, v_start + 3, 2, null, 'fr', 0, 25, v_ip, 3);
  perform pg_temp.check_that('7 a fourth hold over the cap is refused',
    not (v_r ->> 'ok')::boolean and v_r ->> 'reason' = 'too_many_holds', v_r::text);

  -- The same request with no cap passed goes through, proving it was the cap and
  -- not the stay rule or availability that refused the fourth.
  v_r := public.create_direct_reservation(
    'Uncapped', 'uncapped-' || v_email, v_start, v_start + 3, 2, null, 'fr', 0, 25, v_ip, null);
  perform pg_temp.check_that('8 with no cap the same week is available',
    (v_r ->> 'ok')::boolean and v_r ->> 'status' = 'hold', v_r::text);

  -- A confirmed write (no hold lifetime) is never subject to the cap.
  v_r := public.create_direct_reservation(
    'Confirmed', 'conf-' || v_email, v_first + 60, v_first + 63, 2, null, 'fr', 0, null, v_ip, 3);
  perform pg_temp.check_that('9 a confirmed write ignores the hold cap',
    (v_r ->> 'ok')::boolean and v_r ->> 'status' = 'confirmed', v_r::text);
end;
$suite$;

select n, case when pass then 'ok  ' else 'FAIL' end as result, name, detail
  from t_result order by n;

select count(*) filter (where not pass) as failures, count(*) as total from t_result;

rollback;
