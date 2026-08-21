-- The console door, and the count of who has been knocking.
--
-- The console is one password now, so the password is the whole lock and
-- guessing it is the whole attack. A counter has to survive between attempts
-- for that to be slowed down at all, and an in memory one does not: Vercel runs
-- many instances of the same function, so an attacker who keeps retrying simply
-- lands on a fresh one with a fresh count. The same reasoning is already
-- written in README.md about the inquiry form, where it is proportionate
-- because there is no payment behind it. Here there is the whole pricing
-- console behind it, so the count lives in the database like everything else
-- that has to be true across requests.
--
-- Same posture as every other table here: RLS on with no policy, revoked from
-- anon and authenticated, reachable only by the service role on the server.

create table if not exists public.admin_login_attempts (
  ip text primary key,
  failures int not null default 0,
  -- When the current run of failures began. A quiet quarter of an hour starts
  -- a new one, so a wrong password on Monday does not count against Tuesday.
  window_started_at timestamptz not null default now(),
  last_failure_at timestamptz not null default now(),
  locked_until timestamptz,
  constraint admin_login_attempts_failures check (failures >= 0)
);

comment on table public.admin_login_attempts is
  'Failed console sign ins per client address. Rows are transient and are swept once a day has passed with no lock on them.';

alter table public.admin_login_attempts enable row level security;
revoke all on public.admin_login_attempts from anon, authenticated;

-- May this address try at all?
--
-- Called before the password is looked at, so a locked out caller is refused
-- without the secret being compared even once.
create or replace function public.admin_login_gate(p_ip text)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_locked timestamptz;
begin
  -- Housekeeping on the way past, so the table cannot grow without bound.
  delete from public.admin_login_attempts
   where last_failure_at < now() - interval '1 day'
     and (locked_until is null or locked_until <= now());

  select a.locked_until into v_locked
    from public.admin_login_attempts a
   where a.ip = p_ip;

  if v_locked is not null and v_locked > now() then
    return jsonb_build_object(
      'locked', true,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_locked - now())))::int));
  end if;

  return jsonb_build_object('locked', false, 'retry_after_seconds', 0);
end;
$fn$;

-- A wrong password. Counts it, and locks the address once there have been
-- enough of them close together.
create or replace function public.admin_login_failed(
  p_ip text,
  p_max int default 5,
  p_window_minutes int default 15,
  p_lock_minutes int default 15
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_row public.admin_login_attempts;
  v_failures int;
  v_locked timestamptz;
begin
  select * into v_row from public.admin_login_attempts where ip = p_ip for update;

  if not found then
    insert into public.admin_login_attempts (ip, failures) values (p_ip, 1);
    v_failures := 1;

  elsif v_row.window_started_at < now() - make_interval(mins => p_window_minutes)
     or (v_row.locked_until is not null and v_row.locked_until <= now()) then
    -- The run has gone quiet, or a lock has just run out. Either way this is
    -- the first failure of a new run rather than the sixth of an old one.
    v_failures := 1;
    update public.admin_login_attempts
       set failures = 1,
           window_started_at = now(),
           last_failure_at = now(),
           locked_until = null
     where ip = p_ip;

  else
    v_failures := v_row.failures + 1;
    update public.admin_login_attempts
       set failures = v_failures,
           last_failure_at = now()
     where ip = p_ip;
  end if;

  if v_failures >= p_max then
    v_locked := now() + make_interval(mins => p_lock_minutes);
    update public.admin_login_attempts set locked_until = v_locked where ip = p_ip;
  end if;

  return jsonb_build_object(
    'failures', v_failures,
    'locked', v_locked is not null,
    'retry_after_seconds',
      case
        when v_locked is null then 0
        else greatest(1, ceil(extract(epoch from (v_locked - now())))::int)
      end);
end;
$fn$;

-- The right password. The slate is wiped, so a morning of fat fingers costs
-- nothing once the owner is actually in.
create or replace function public.admin_login_succeeded(p_ip text)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  delete from public.admin_login_attempts where ip = p_ip;
  return jsonb_build_object('ok', true);
end;
$fn$;

revoke all on function public.admin_login_gate(text) from public, anon, authenticated;
revoke all on function public.admin_login_failed(text, int, int, int) from public, anon, authenticated;
revoke all on function public.admin_login_succeeded(text) from public, anon, authenticated;

grant execute on function public.admin_login_gate(text) to service_role;
grant execute on function public.admin_login_failed(text, int, int, int) to service_role;
grant execute on function public.admin_login_succeeded(text) to service_role;
