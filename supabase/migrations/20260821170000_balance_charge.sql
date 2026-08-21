-- Phase 3, lot 5: the balance, taken on its own before arrival.
--
-- Stripe does not schedule a calendar date outside a subscription, so the
-- decision of when lives here and Stripe only executes. A daily pg_cron job
-- posts to the site, which is where the secret key already is; nothing about
-- Stripe is stored in this database (constitution VI), exactly as the iCal
-- importer keeps its own shared secret in `sync_config` and never in a file.
--
-- The amount is the one frozen at confirmation. `get_quote` is not called
-- again: a rate the owner changed in March must not move a figure a guest
-- agreed to in January.
--
-- Everything below is built around one rule: a card is charged at most once.
-- A row is claimed before it is charged, the claim is a column rather than a
-- lock so it survives the http round trip, and a claim that was never released
-- because the runner died is reclaimed after half an hour.

-- ---------------------------------------------------------------------------
-- What a balance carries
-- ---------------------------------------------------------------------------

alter table public.reservation_payments
  add column if not exists stripe_balance_intent_id text,
  add column if not exists stripe_balance_session_id text,
  -- Our own URL, not Stripe's. A Checkout session dies within a day, and a
  -- guest who opens the email the following evening must not find a dead link,
  -- so the email points here and the session is minted when it is clicked.
  add column if not exists balance_link_token text,
  add column if not exists balance_paid_at timestamptz,
  add column if not exists balance_attempts int not null default 0,
  add column if not exists balance_reminders_sent int not null default 0,
  add column if not exists balance_last_attempt_at timestamptz,
  add column if not exists balance_next_attempt_at timestamptz,
  -- The claim. Set before Stripe is called, cleared when the answer is in.
  add column if not exists balance_processing_at timestamptz;

comment on column public.reservation_payments.balance_processing_at is
  'Claimed by a runner. A claim older than the stale window is taken back, because the runner that set it is gone.';
comment on column public.reservation_payments.balance_link_token is
  'Unguessable path segment for the fallback payment link. Null until a fallback is needed, and cleared when the balance is paid.';

create unique index if not exists reservation_payments_balance_intent_idx
  on public.reservation_payments (stripe_balance_intent_id)
  where stripe_balance_intent_id is not null;

create unique index if not exists reservation_payments_balance_session_idx
  on public.reservation_payments (stripe_balance_session_id)
  where stripe_balance_session_id is not null;

create unique index if not exists reservation_payments_balance_token_idx
  on public.reservation_payments (balance_link_token)
  where balance_link_token is not null;

create index if not exists reservation_payments_balance_due_idx
  on public.reservation_payments (balance_charge_on)
  where balance_status in ('pending', 'action_required', 'failed');

-- ---------------------------------------------------------------------------
-- The log
-- ---------------------------------------------------------------------------
--
-- Every attempt, whatever came of it. A charge that silently did not happen is
-- the failure mode that costs the most here, so the absence of a row is itself
-- the signal, and the console reads this to say what has been tried.
create table if not exists public.balance_charge_attempts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  kind text not null check (kind in ('charge', 'link', 'reminder', 'webhook')),
  amount numeric(10,2),
  currency text not null default 'EUR',
  outcome text not null
    check (outcome in ('paid', 'action_required', 'failed', 'sent', 'skipped', 'error')),
  stripe_reference text,
  stripe_code text,
  detail text
);

comment on table public.balance_charge_attempts is
  'One row per balance attempt, for the console and for working out afterwards what happened.';

create index if not exists balance_charge_attempts_reservation_idx
  on public.balance_charge_attempts (reservation_id, attempted_at desc);

alter table public.balance_charge_attempts enable row level security;
revoke all on public.balance_charge_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Claiming what is due
-- ---------------------------------------------------------------------------
--
-- Two kinds of work come back from here.
--
--   pending, and the charge date has arrived   charge the saved card
--   action_required or failed, and the wait     send the link again
--   is over and the reminders are not spent
--
-- A cancelled reservation is never selected, which is the whole of the "do not
-- charge a stay that is off" rule: it is one join condition, in one place.
create or replace function public.claim_due_balances(
  p_limit int default 25,
  p_stale_minutes int default 30,
  p_max_reminders int default 2
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_rows jsonb;
begin
  -- A claim nobody released belongs to a runner that is no longer running.
  update public.reservation_payments
     set balance_processing_at = null
   where balance_processing_at is not null
     and balance_processing_at < now() - make_interval(mins => p_stale_minutes);

  with due as (
    select p.reservation_id
      from public.reservation_payments p
      join public.reservations r on r.id = p.reservation_id
     where r.status = 'confirmed'
       and p.deposit_status = 'paid'
       and p.balance_status <> 'paid'
       and p.balance_due > 0
       and p.balance_processing_at is null
       and (
         (p.balance_status = 'pending'
          and p.balance_charge_on is not null
          and p.balance_charge_on <= public.booking_today())
         or
         (p.balance_status in ('action_required', 'failed')
          and p.balance_next_attempt_at is not null
          and p.balance_next_attempt_at <= now()
          and p.balance_reminders_sent < p_max_reminders)
       )
     order by p.balance_charge_on
     limit p_limit
       for update of p skip locked
  ),
  claimed as (
    update public.reservation_payments p
       set balance_processing_at = now(),
           updated_at = now()
      from due
     where p.reservation_id = due.reservation_id
    returning p.*
  )
  select jsonb_agg(jsonb_build_object(
           'reservation_id', c.reservation_id,
           'guest_name', r.guest_name,
           'guest_email', r.guest_email,
           'locale', r.locale,
           'start_date', r.start_date,
           'end_date', r.end_date,
           'party_size', r.party_size,
           'adults', c.adults,
           'minors', c.minors,
           'balance_due', c.balance_due,
           'balance_status', c.balance_status,
           'balance_charge_on', c.balance_charge_on,
           'currency', c.currency,
           'customer_id', c.stripe_customer_id,
           'payment_method_id', c.stripe_payment_method_id,
           'save_card_consent', c.save_card_consent,
           'link_token', c.balance_link_token,
           'attempts', c.balance_attempts,
           'reminders_sent', c.balance_reminders_sent)
           order by c.balance_charge_on)
    into v_rows
    from claimed c
    join public.reservations r on r.id = c.reservation_id;

  return coalesce(v_rows, '[]'::jsonb);
end;
$fn$;

-- Hands a claim back without deciding anything, when the runner could not act.
create or replace function public.release_balance_claim(
  p_reservation_id uuid,
  p_detail text default null
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  update public.reservation_payments
     set balance_processing_at = null,
         updated_at = now()
   where reservation_id = p_reservation_id;

  if p_detail is not null then
    insert into public.balance_charge_attempts
      (reservation_id, kind, outcome, detail)
    values (p_reservation_id, 'charge', 'skipped', left(p_detail, 500));
  end if;

  return jsonb_build_object('ok', true);
end;
$fn$;

-- The token behind the fallback link. Minted once and kept, so a reminder
-- points at the same URL as the first email did.
create or replace function public.ensure_balance_link_token(p_reservation_id uuid)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_token text;
begin
  select p.balance_link_token into v_token
    from public.reservation_payments p
   where p.reservation_id = p_reservation_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_reservation');
  end if;

  if v_token is null then
    v_token := replace(replace(
      encode(extensions.gen_random_bytes(24), 'base64'), '+', '-'), '/', '_');

    update public.reservation_payments
       set balance_link_token = v_token,
           updated_at = now()
     where reservation_id = p_reservation_id;
  end if;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$fn$;

-- What the pay link resolves to. Read only: the session is minted by the route.
create or replace function public.balance_by_link_token(p_token text)
returns jsonb
language sql
stable
set search_path = pg_catalog, pg_temp
as $fn$
  select coalesce(
    (select jsonb_build_object(
              'found', true,
              'reservation_id', p.reservation_id,
              'balance_due', p.balance_due,
              'balance_status', p.balance_status,
              'currency', p.currency,
              'customer_id', p.stripe_customer_id,
              'locale', r.locale,
              'guest_email', r.guest_email,
              'guest_name', r.guest_name,
              'start_date', r.start_date,
              'end_date', r.end_date,
              'reservation_status', r.status)
       from public.reservation_payments p
       join public.reservations r on r.id = p.reservation_id
      where p.balance_link_token = p_token),
    jsonb_build_object('found', false));
$fn$;

-- ---------------------------------------------------------------------------
-- What came of an attempt
-- ---------------------------------------------------------------------------

-- Paid, and paid once.
--
-- Called by the runner when the off session charge cleared, and by the webhook
-- when Stripe says so, which for the fallback link is the only way we hear. The
-- row is locked and the first caller to find it unpaid is the only one that
-- gets `changed: true`, so a replayed webhook sends no second receipt.
--
-- The reservation is resolved from whichever reference the caller has.
create or replace function public.settle_balance_payment(
  p_reservation_id uuid default null,
  p_intent_id text default null,
  p_session_id text default null,
  p_source text default 'webhook'
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_id uuid;
  v_pay public.reservation_payments;
  v_res public.reservations;
  v_details jsonb;
begin
  v_id := p_reservation_id;

  if v_id is null and p_intent_id is not null then
    select p.reservation_id into v_id
      from public.reservation_payments p
     where p.stripe_balance_intent_id = p_intent_id;
  end if;

  if v_id is null and p_session_id is not null then
    select p.reservation_id into v_id
      from public.reservation_payments p
     where p.stripe_balance_session_id = p_session_id;
  end if;

  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_balance');
  end if;

  select * into v_pay from public.reservation_payments where reservation_id = v_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_balance');
  end if;

  select * into v_res from public.reservations where id = v_id;

  v_details := jsonb_build_object(
    'reservation_id', v_id,
    'guest_name', v_res.guest_name,
    'guest_email', v_res.guest_email,
    'locale', v_res.locale,
    'start_date', v_res.start_date,
    'end_date', v_res.end_date,
    'party_size', v_res.party_size,
    'adults', v_pay.adults,
    'minors', v_pay.minors,
    'balance_due', v_pay.balance_due,
    'deposit_amount', v_pay.deposit_amount,
    'currency', v_pay.currency
  );

  if v_pay.balance_status = 'paid' then
    return jsonb_build_object('ok', true, 'changed', false) || v_details;
  end if;

  update public.reservation_payments
     set balance_status = 'paid',
         balance_paid_at = now(),
         balance_processing_at = null,
         balance_next_attempt_at = null,
         -- The link is spent: a paid balance has nothing left to pay.
         balance_link_token = null,
         stripe_balance_intent_id = coalesce(p_intent_id, stripe_balance_intent_id),
         stripe_balance_session_id = coalesce(p_session_id, stripe_balance_session_id),
         last_error = null,
         updated_at = now()
   where reservation_id = v_id;

  insert into public.balance_charge_attempts
    (reservation_id, kind, amount, currency, outcome, stripe_reference, detail)
  values (v_id,
          case when p_source = 'webhook' then 'webhook' else 'charge' end,
          v_pay.balance_due, v_pay.currency, 'paid',
          coalesce(p_intent_id, p_session_id), p_source);

  return jsonb_build_object('ok', true, 'changed', true) || v_details;
end;
$fn$;

-- The bank wants the guest present. Not an exotic case in Europe, which is why
-- the fallback link is part of the design and not an afterthought.
create or replace function public.mark_balance_action_required(
  p_reservation_id uuid,
  p_intent_id text default null,
  p_code text default null,
  p_detail text default null,
  p_retry_days int default 3
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_updated int;
begin
  update public.reservation_payments
     set balance_status = 'action_required',
         balance_attempts = balance_attempts + 1,
         balance_last_attempt_at = now(),
         balance_next_attempt_at = now() + make_interval(days => greatest(p_retry_days, 1)),
         balance_processing_at = null,
         stripe_balance_intent_id = coalesce(p_intent_id, stripe_balance_intent_id),
         last_error = left(coalesce(p_detail, p_code, 'authentication_required'), 500),
         updated_at = now()
   where reservation_id = p_reservation_id
     and balance_status <> 'paid';

  get diagnostics v_updated = row_count;

  -- Nothing was written, so nothing is logged: a balance already paid is not
  -- given a failure it never had.
  if v_updated = 0 then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  insert into public.balance_charge_attempts
    (reservation_id, kind, amount, currency, outcome, stripe_reference, stripe_code, detail)
  select p_reservation_id, 'charge', p.balance_due, p.currency, 'action_required',
         p_intent_id, p_code, left(p_detail, 500)
    from public.reservation_payments p
   where p.reservation_id = p_reservation_id;

  return jsonb_build_object('ok', true, 'changed', true);
end;
$fn$;

-- The card said no for a reason the guest cannot fix by tapping their bank app.
create or replace function public.mark_balance_failed(
  p_reservation_id uuid,
  p_intent_id text default null,
  p_code text default null,
  p_detail text default null,
  p_retry_days int default 3
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_updated int;
begin
  update public.reservation_payments
     set balance_status = 'failed',
         balance_attempts = balance_attempts + 1,
         balance_last_attempt_at = now(),
         balance_next_attempt_at = now() + make_interval(days => greatest(p_retry_days, 1)),
         balance_processing_at = null,
         stripe_balance_intent_id = coalesce(p_intent_id, stripe_balance_intent_id),
         last_error = left(coalesce(p_detail, p_code, 'charge_failed'), 500),
         updated_at = now()
   where reservation_id = p_reservation_id
     and balance_status <> 'paid';

  get diagnostics v_updated = row_count;

  -- Nothing was written, so nothing is logged: a balance already paid is not
  -- given a failure it never had.
  if v_updated = 0 then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  insert into public.balance_charge_attempts
    (reservation_id, kind, amount, currency, outcome, stripe_reference, stripe_code, detail)
  select p_reservation_id, 'charge', p.balance_due, p.currency, 'failed',
         p_intent_id, p_code, left(p_detail, 500)
    from public.reservation_payments p
   where p.reservation_id = p_reservation_id;

  return jsonb_build_object('ok', true, 'changed', true);
end;
$fn$;

-- A follow up email went out. Counted, because there is a number of times it is
-- reasonable to ask before a person has to pick up the telephone.
create or replace function public.mark_balance_reminded(
  p_reservation_id uuid,
  p_retry_days int default 3
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_sent int;
begin
  update public.reservation_payments
     set balance_reminders_sent = balance_reminders_sent + 1,
         balance_last_attempt_at = now(),
         balance_next_attempt_at = now() + make_interval(days => greatest(p_retry_days, 1)),
         balance_processing_at = null,
         updated_at = now()
   where reservation_id = p_reservation_id
     and balance_status <> 'paid'
  returning balance_reminders_sent into v_sent;

  if v_sent is null then
    return jsonb_build_object('ok', true, 'changed', false, 'reminders_sent', 0);
  end if;

  insert into public.balance_charge_attempts
    (reservation_id, kind, amount, currency, outcome, detail)
  select p_reservation_id, 'reminder', p.balance_due, p.currency, 'sent',
         format('reminder %s', v_sent)
    from public.reservation_payments p
   where p.reservation_id = p_reservation_id;

  return jsonb_build_object('ok', true, 'changed', true, 'reminders_sent', v_sent);
end;
$fn$;

-- The Checkout session minted for a click on the fallback link, so the webhook
-- for that session has something to match.
create or replace function public.record_balance_session(
  p_reservation_id uuid,
  p_session_id text
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_updated int;
begin
  update public.reservation_payments
     set stripe_balance_session_id = p_session_id,
         updated_at = now()
   where reservation_id = p_reservation_id
     and balance_status <> 'paid';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  insert into public.balance_charge_attempts
    (reservation_id, kind, amount, currency, outcome, stripe_reference)
  select p_reservation_id, 'link', p.balance_due, p.currency, 'sent', p_session_id
    from public.reservation_payments p
   where p.reservation_id = p_reservation_id;

  return jsonb_build_object('ok', true, 'changed', true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- What the console shows
-- ---------------------------------------------------------------------------
--
-- Every balance that is not settled, plus the ones settled recently, so the
-- owner can see both what needs her and what went through on its own.
create or replace function public.admin_balances(p_limit int default 60)
returns table (
  b_reservation_id uuid,
  b_guest_name text,
  b_guest_email text,
  b_locale text,
  b_start_date date,
  b_end_date date,
  b_reservation_status text,
  b_amount numeric,
  b_currency text,
  b_status text,
  b_charge_on date,
  b_paid_at timestamptz,
  b_attempts int,
  b_reminders int,
  b_last_attempt_at timestamptz,
  b_next_attempt_at timestamptz,
  b_consent boolean,
  b_last_error text
)
language sql
stable
set search_path = pg_catalog, pg_temp
as $fn$
  select
    p.reservation_id, r.guest_name, r.guest_email, r.locale,
    r.start_date, r.end_date, r.status,
    p.balance_due, p.currency, p.balance_status, p.balance_charge_on,
    p.balance_paid_at, p.balance_attempts, p.balance_reminders_sent,
    p.balance_last_attempt_at, p.balance_next_attempt_at,
    p.save_card_consent, p.last_error
  from public.reservation_payments p
  join public.reservations r on r.id = p.reservation_id
 where p.deposit_status = 'paid'
   and (p.balance_status <> 'paid' or p.balance_paid_at > now() - interval '90 days')
 order by
   -- What needs a person first, then what is merely waiting for its date.
   case p.balance_status
     when 'failed' then 1
     when 'action_required' then 2
     when 'pending' then 3
     else 4
   end,
   p.balance_charge_on
 limit p_limit;
$fn$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.claim_due_balances(int, int, int) from public, anon, authenticated;
revoke all on function public.release_balance_claim(uuid, text) from public, anon, authenticated;
revoke all on function public.ensure_balance_link_token(uuid) from public, anon, authenticated;
revoke all on function public.balance_by_link_token(text) from public, anon, authenticated;
revoke all on function public.settle_balance_payment(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.mark_balance_action_required(uuid, text, text, text, int) from public, anon, authenticated;
revoke all on function public.mark_balance_failed(uuid, text, text, text, int) from public, anon, authenticated;
revoke all on function public.mark_balance_reminded(uuid, int) from public, anon, authenticated;
revoke all on function public.record_balance_session(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_balances(int) from public, anon, authenticated;

grant execute on function public.claim_due_balances(int, int, int) to service_role;
grant execute on function public.release_balance_claim(uuid, text) to service_role;
grant execute on function public.ensure_balance_link_token(uuid) to service_role;
grant execute on function public.balance_by_link_token(text) to service_role;
grant execute on function public.settle_balance_payment(uuid, text, text, text) to service_role;
grant execute on function public.mark_balance_action_required(uuid, text, text, text, int) to service_role;
grant execute on function public.mark_balance_failed(uuid, text, text, text, int) to service_role;
grant execute on function public.mark_balance_reminded(uuid, int) to service_role;
grant execute on function public.record_balance_session(uuid, text) to service_role;
grant execute on function public.admin_balances(int) to service_role;

-- ---------------------------------------------------------------------------
-- The schedule
-- ---------------------------------------------------------------------------
--
-- Same shape as the Phase 2 iCal job: the shared secret is generated inside the
-- database and never copied by hand. The site reads it back through the service
-- role and compares, so setting this up is one migration and no dashboard step.
insert into public.sync_config (key, value)
select 'balance_secret',
       replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_')
on conflict (key) do nothing;

select cron.unschedule('charge-balances')
 where exists (select 1 from cron.job where jobname = 'charge-balances');

-- Once a day, early. A run that is missed costs nothing: the selection is
-- "the charge date has arrived", not "the charge date is today", so a balance
-- that slipped through is picked up on the next pass.
select cron.schedule('charge-balances', '0 7 * * *', $job$
  select net.http_post(
    url := 'https://www.obordeleau.fr/api/balances/run',
    body := jsonb_build_object('trigger', 'cron'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-balance-secret', (select value from public.sync_config where key = 'balance_secret')
    ),
    timeout_milliseconds := 55000
  );
$job$);
