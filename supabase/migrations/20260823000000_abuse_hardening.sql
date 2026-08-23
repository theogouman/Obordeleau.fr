-- Abuse hardening: a shared rate limiter, and a cap on how many nights one
-- actor can hold at once.
--
-- Two gaps this closes, both about automated abuse rather than the booking
-- logic itself, which the exclusion constraint already settles.
--
--   1. The read endpoints (quote, stay, availability) had no throttle at all,
--      and the checkout had only an in-memory, per-instance one. Vercel runs
--      many instances of the same function, so that counter reset every time a
--      caller landed on a fresh one, and it keyed on an address the caller can
--      spoof in a header. A counter that lives in the database, keyed on the
--      platform's own client IP, is shared across every instance and is the
--      same posture already used for the admin login (see
--      20260821180000_admin_login_attempts.sql).
--
--   2. Every checkout places a hold that blocks the nights for 25 minutes
--      before a card is even touched. A script could place holds on many future
--      weeks and make the calendar read as full without paying a cent. A cap on
--      the number of concurrent holds one address (or one email) may keep,
--      enforced inside the one write path under a per-address advisory lock so
--      the count is exact under a race, bounds how many nights a single actor
--      can freeze. The rate limiter above is the first line; this is the floor
--      the rate limiter cannot be tricked past.

-- ---------------------------------------------------------------------------
-- Shared rate limiter
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limit_hits (
  -- "<endpoint>:<client ip>". One row per caller per endpoint.
  bucket text primary key,
  hits int not null default 0,
  window_started_at timestamptz not null default now()
);

comment on table public.rate_limit_hits is
  'One row per (endpoint, client) window, shared across all serverless instances. Swept hourly by cron; a rolled over row is also reset in place on its next hit.';

alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

-- Records one call against a bucket and says whether it is now over the limit.
--
-- Atomic by construction: the row is inserted, or locked and updated, in a
-- single statement, so two instances counting the same caller at the same
-- instant cannot both act on a stale value. A window that has run out is reset
-- in place rather than swept first, so the very first call of a new window
-- counts as one and is never wrongly refused.
create or replace function public.rate_limit_hit(
  p_bucket text,
  p_limit int,
  p_window_seconds int
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_hits int;
  v_started timestamptz;
begin
  insert into public.rate_limit_hits as h (bucket, hits, window_started_at)
  values (p_bucket, 1, now())
  on conflict (bucket) do update
     set hits = case
                  when h.window_started_at < now() - make_interval(secs => p_window_seconds)
                  then 1
                  else h.hits + 1
                end,
         window_started_at = case
                  when h.window_started_at < now() - make_interval(secs => p_window_seconds)
                  then now()
                  else h.window_started_at
                end
  returning h.hits, h.window_started_at into v_hits, v_started;

  return jsonb_build_object(
    'limited', v_hits > p_limit,
    'hits', v_hits,
    'retry_after_seconds',
      greatest(1, ceil(extract(epoch from
        (v_started + make_interval(secs => p_window_seconds) - now())))::int));
end;
$fn$;

revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- The table only ever holds live windows. A row nobody has touched for a couple
-- of hours belongs to a window long closed, so it is deleted rather than kept.
select cron.unschedule('sweep-rate-limits')
 where exists (select 1 from cron.job where jobname = 'sweep-rate-limits');

select cron.schedule('sweep-rate-limits', '7 * * * *', $job$
  delete from public.rate_limit_hits where window_started_at < now() - interval '2 hours';
$job$);

-- ---------------------------------------------------------------------------
-- A cap on concurrent holds
-- ---------------------------------------------------------------------------

-- Which address placed a hold, so the cap can be counted per address. Set only
-- while a hold is live; null on a confirmed booking, which never had one, and
-- of no interest once a hold is swept.
alter table public.reservations
  add column if not exists hold_ip text;

comment on column public.reservations.hold_ip is
  'The client address that placed a hold, used only to cap concurrent holds per actor. Never shown, never exported.';

create index if not exists reservations_hold_ip_idx
  on public.reservations (hold_ip)
  where status = 'hold';

-- The write path, now able to refuse an actor who is already holding too much.
--
-- Everything about the stay rule, the minors check and the hold lifetime is
-- unchanged from 20260821150000_payment_holds.sql. The only additions are the
-- two trailing arguments and the block that acts on them: for a hold, and only
-- for a hold, an advisory lock is taken on the address so two simultaneous
-- attempts from it are serialised, the live holds it (or the email) already has
-- are counted, and the request is refused with `too_many_holds` once the cap is
-- reached. A confirmed write (p_hold_minutes null) is untouched, as is a
-- returning visitor, who reuses an existing hold through find_active_hold and
-- so never reaches this insert a second time.
--
-- Dropped rather than replaced: new arguments make a new function, and
-- PostgREST would otherwise see two overloads of the same name.
drop function if exists public.create_direct_reservation(
  text, text, date, date, int, text, text, int, int);

create or replace function public.create_direct_reservation(
  p_guest_name text,
  p_guest_email text,
  p_start date,
  p_end date,
  p_party_size int default null,
  p_notes text default null,
  p_locale text default null,
  p_minors int default 0,
  p_hold_minutes int default null,
  p_hold_ip text default null,
  p_max_active_holds int default null
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_check jsonb;
  v_id uuid;
  v_created timestamptz;
  v_status text;
  v_expires timestamptz;
  v_active int;
begin
  -- Before anything is judged unavailable, give back the nights nobody is
  -- paying for. Cron does this too; doing it here keeps the answer immediate
  -- for the visitor standing in front of the calendar, and keeps the cap count
  -- below from counting holds that have already run out.
  perform public.expire_stale_holds();

  v_check := public.validate_stay(p_start, p_end);

  if not coalesce((v_check ->> 'valid')::boolean, false) then
    return jsonb_build_object('ok', false) || (v_check - 'valid');
  end if;

  if p_minors is not null and p_minors < 0 then
    return jsonb_build_object('ok', false, 'reason', 'minors');
  end if;
  if p_minors is not null and p_party_size is not null and p_minors >= p_party_size then
    return jsonb_build_object('ok', false, 'reason', 'minors');
  end if;

  if p_hold_minutes is not null and p_hold_minutes < 1 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_hold');
  end if;

  if p_hold_minutes is null then
    v_status := 'confirmed';
    v_expires := null;
  else
    v_status := 'hold';
    v_expires := now() + make_interval(mins => p_hold_minutes);
  end if;

  -- The cap, for holds only. The advisory lock is on the address and lasts the
  -- transaction, so two holds racing from the same address are counted one
  -- after the other rather than both reading the same pre-insert total. The
  -- email is counted alongside the address, so rotating one without the other
  -- is caught.
  if v_status = 'hold' and p_max_active_holds is not null then
    if p_hold_ip is not null and p_hold_ip <> '' then
      perform pg_advisory_xact_lock(hashtext('hold_ip:' || p_hold_ip));
    end if;

    select count(*) into v_active
      from public.reservations r
     where r.status = 'hold'
       and r.hold_expires_at > now()
       and (
         (p_hold_ip is not null and p_hold_ip <> '' and r.hold_ip = p_hold_ip)
         or lower(r.guest_email) = lower(p_guest_email)
       );

    if v_active >= p_max_active_holds then
      return jsonb_build_object('ok', false, 'reason', 'too_many_holds');
    end if;
  end if;

  begin
    insert into public.reservations
      (source, guest_name, guest_email, party_size, minors, start_date, end_date,
       notes, locale, status, hold_expires_at, hold_ip)
    values
      ('direct', p_guest_name, p_guest_email, p_party_size, coalesce(p_minors, 0),
       p_start, p_end, p_notes, p_locale, v_status, v_expires,
       case when v_status = 'hold' then p_hold_ip else null end)
    returning id, created_at into v_id, v_created;
  exception when exclusion_violation then
    -- Another checkout took these nights between the check and the insert.
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'status', v_status,
    'hold_expires_at', v_expires,
    'start_date', p_start,
    'end_date', p_end,
    'created_at', v_created
  );
end;
$fn$;

revoke all on function public.create_direct_reservation(
  text, text, date, date, int, text, text, int, int, text, int)
  from public, anon, authenticated;
grant execute on function public.create_direct_reservation(
  text, text, date, date, int, text, text, int, int, text, int)
  to service_role;
