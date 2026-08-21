-- The console door: how many wrong answers, and what happens after them.
--
-- One transaction that always rolls back. Times that have to be in the past are
-- written into the row directly, because now() does not move inside a
-- transaction and the point here is what happens when it has.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin-login.test.sql

begin;

create temporary table t_result (n int generated always as identity, name text, pass boolean, detail text)
  on commit drop;

create or replace function pg_temp.check_that(p_name text, p_pass boolean, p_detail text default null)
returns void language sql as $$
  insert into t_result (name, pass, detail) values (p_name, p_pass, p_detail);
$$;

do $suite$
declare
  v_ip text := '198.51.100.7';
  v_other text := '203.0.113.9';
  v_gate jsonb;
  v_fail jsonb;
begin
  ------------------------------------------------------------ nobody is locked
  v_gate := public.admin_login_gate(v_ip);
  perform pg_temp.check_that('1 an address nobody has seen may try',
    not (v_gate ->> 'locked')::boolean, v_gate::text);

  --------------------------------------------------------- four is not too many
  for i in 1..4 loop
    v_fail := public.admin_login_failed(v_ip, 5, 15, 15);
  end loop;

  perform pg_temp.check_that('2 four wrong answers are counted but do not lock',
    (v_fail ->> 'failures')::int = 4 and not (v_fail ->> 'locked')::boolean, v_fail::text);

  perform pg_temp.check_that('3 and the door is still open',
    not (public.admin_login_gate(v_ip) ->> 'locked')::boolean);

  ------------------------------------------------------------- the fifth closes it
  v_fail := public.admin_login_failed(v_ip, 5, 15, 15);

  perform pg_temp.check_that('4 the fifth locks the address, and says for how long',
    (v_fail ->> 'failures')::int = 5
      and (v_fail ->> 'locked')::boolean
      and (v_fail ->> 'retry_after_seconds')::int between 1 and 900,
    v_fail::text);

  v_gate := public.admin_login_gate(v_ip);
  perform pg_temp.check_that('5 and the gate turns it away before any password is compared',
    (v_gate ->> 'locked')::boolean and (v_gate ->> 'retry_after_seconds')::int > 0,
    v_gate::text);

  perform pg_temp.check_that('6 somebody else is not caught by it',
    not (public.admin_login_gate(v_other) ->> 'locked')::boolean);

  --------------------------------------------------------- the right answer clears
  perform public.admin_login_succeeded(v_ip);

  perform pg_temp.check_that('7 signing in wipes the slate',
    not exists (select 1 from public.admin_login_attempts a where a.ip = v_ip));

  perform pg_temp.check_that('8 so the next attempt starts clean',
    not (public.admin_login_gate(v_ip) ->> 'locked')::boolean);

  ------------------------------------------------------------- a lock runs out
  for i in 1..5 loop
    v_fail := public.admin_login_failed(v_ip, 5, 15, 15);
  end loop;

  update public.admin_login_attempts
     set locked_until = now() - interval '1 minute'
   where ip = v_ip;

  perform pg_temp.check_that('9 an expired lock is not a lock',
    not (public.admin_login_gate(v_ip) ->> 'locked')::boolean);

  v_fail := public.admin_login_failed(v_ip, 5, 15, 15);

  perform pg_temp.check_that('10 and the count starts again rather than locking at once',
    (v_fail ->> 'failures')::int = 1 and not (v_fail ->> 'locked')::boolean,
    v_fail::text);

  ------------------------------------------------------- a quiet run is forgotten
  update public.admin_login_attempts
     set failures = 4,
         window_started_at = now() - interval '20 minutes'
   where ip = v_ip;

  v_fail := public.admin_login_failed(v_ip, 5, 15, 15);

  perform pg_temp.check_that('11 a wrong password twenty minutes ago does not count against now',
    (v_fail ->> 'failures')::int = 1, v_fail::text);

  ----------------------------------------------------------------- housekeeping
  insert into public.admin_login_attempts (ip, failures, window_started_at, last_failure_at)
  values ('192.0.2.1', 3, now() - interval '2 days', now() - interval '2 days');

  perform public.admin_login_gate(v_other);

  perform pg_temp.check_that('12 rows nobody has touched for a day are swept on the way past',
    not exists (select 1 from public.admin_login_attempts a where a.ip = '192.0.2.1'));

  insert into public.admin_login_attempts (ip, failures, window_started_at, last_failure_at, locked_until)
  values ('192.0.2.2', 5, now() - interval '2 days', now() - interval '2 days', now() + interval '10 minutes');

  perform public.admin_login_gate(v_other);

  perform pg_temp.check_that('13 but an address still serving a lock is kept',
    exists (select 1 from public.admin_login_attempts a where a.ip = '192.0.2.2'));
end;
$suite$;

select n, case when pass then 'ok' else 'FAIL' end as result, name, detail
  from t_result where not pass order by n;

select count(*) filter (where not pass) as failures, count(*) as total from t_result;

rollback;
