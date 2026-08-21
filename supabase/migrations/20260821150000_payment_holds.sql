-- Phase 3, lot 4: the hold, and where a payment is remembered.
--
-- The race this exists to close.
--
-- Instant booking with a deposit means the visitor reaches a card form before
-- anything is written. Two visitors can reach it for the same week at the same
-- moment. If the reservation were only written on the payment webhook, both
-- cards would be charged and the second write would then fail on the exclusion
-- constraint: a deposit taken for a week that cannot be honoured, and a refund
-- to make by hand. The Phase 2 constraint does not help, because it only covers
-- `status = 'confirmed'` and nothing is confirmed yet while a card is being
-- typed.
--
-- So the nights are taken before Stripe is called, as a short lived `hold`, and
-- the constraint is widened to cover holds. The second checkout is then refused
-- by the same mechanism that already settles two simultaneous bookings, before
-- a single euro moves. The hold converts to `confirmed` when the deposit
-- succeeds, and is swept back to `cancelled` when it is abandoned.
--
-- The constraint cannot expire a hold on its own: an index predicate has to be
-- immutable and `now()` is not. Expiry is therefore a sweep, run at the top of
-- the write path where it matters and by cron as the backstop. Reads treat an
-- expired but unswept hold as busy, which is the same answer the constraint
-- would give, so the picker is never kinder than the write path.

-- ---------------------------------------------------------------------------
-- The hold state
-- ---------------------------------------------------------------------------

alter table public.reservations
  drop constraint if exists reservations_status_check;

alter table public.reservations
  add constraint reservations_status_check
  check (status in ('confirmed', 'hold', 'cancelled'));

alter table public.reservations
  add column if not exists hold_expires_at timestamptz;

comment on column public.reservations.hold_expires_at is
  'When a hold stops being honoured. Set only while status = hold; kept after the sweep as a record of what the hold was.';

alter table public.reservations
  drop constraint if exists reservations_hold_expiry;

-- One directional on purpose: a swept hold keeps its expiry as evidence.
alter table public.reservations
  add constraint reservations_hold_expiry
  check (status <> 'hold' or hold_expires_at is not null);

-- Defence in depth on capacity. The rule already lives in the booking routes
-- and in the form; this makes it impossible for any write path, present or
-- future, to put five people in a studio that sleeps four. The figure is
-- content/property.json capacity.maxGuests; a check constraint has to be
-- immutable, so changing the capacity is a migration, not a config edit.
alter table public.reservations
  drop constraint if exists reservations_within_capacity;

alter table public.reservations
  add constraint reservations_within_capacity
  check (party_size is null or party_size <= 4);

-- A hold blocks the nights exactly as a confirmed reservation does. This one
-- line is what makes the double deposit impossible.
alter table public.reservations
  drop constraint if exists reservations_no_overlap;

alter table public.reservations
  add constraint reservations_no_overlap
  exclude using gist ((daterange(start_date, end_date, '[)')) with &&)
  where (status in ('confirmed', 'hold'));

drop index if exists public.reservations_confirmed_range_idx;

create index if not exists reservations_live_range_idx
  on public.reservations using gist (daterange(start_date, end_date, '[)'))
  where status in ('confirmed', 'hold');

-- Feeds the sweep, which runs on every checkout as well as on the schedule.
create index if not exists reservations_hold_expiry_idx
  on public.reservations (hold_expires_at)
  where status = 'hold';

-- ---------------------------------------------------------------------------
-- Where a payment is remembered
-- ---------------------------------------------------------------------------
--
-- A companion table rather than more columns on `reservations`, because this is
-- payment state with its own lifecycle: it is locked on its own during the
-- webhook, and lot 5 reads it without touching the booking.
--
-- The price is frozen here at confirmation. Lot 5 never recomputes: it charges
-- `balance_due` as agreed, whatever the rates have done in the meantime.
create table if not exists public.reservation_payments (
  reservation_id uuid primary key
    references public.reservations(id) on delete cascade,
  stripe_customer_id text,
  -- Unique, so a replayed webhook lands on exactly one row.
  stripe_payment_intent_id text unique,
  -- The saved card. Written only when the guest opted in, and the one thing
  -- lot 5 cannot work without.
  stripe_payment_method_id text,
  currency text not null default 'EUR',
  deposit_amount numeric(10,2) not null,
  deposit_status text not null default 'pending'
    check (deposit_status in ('pending', 'paid', 'failed', 'refunded')),
  deposit_paid_at timestamptz,
  -- Half the accommodation, plus the whole tourist tax, plus the cleaning.
  balance_due numeric(10,2) not null,
  balance_status text not null default 'pending'
    check (balance_status in ('pending', 'paid', 'action_required', 'failed')),
  -- check_in minus deposit_charge_days_before_arrival. Lot 5 reads this.
  balance_charge_on date,
  -- No opt in, no saved card, and therefore no automatic balance.
  save_card_consent boolean not null default false,
  adults int not null check (adults >= 1),
  minors int not null default 0 check (minors >= 0),
  -- The whole get_quote answer as it stood when the deposit was taken, so a
  -- receipt can be reprinted without asking the engine for today's prices.
  quote jsonb not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_payments_amounts
    check (deposit_amount >= 0 and balance_due >= 0)
);

comment on table public.reservation_payments is
  'One row per reservation that went through checkout. Holds the Stripe references, the frozen quote, and what lot 5 needs to charge the balance.';

create index if not exists reservation_payments_balance_idx
  on public.reservation_payments (balance_charge_on)
  where balance_status = 'pending';

alter table public.reservation_payments enable row level security;

revoke all on public.reservation_payments from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Expiry
-- ---------------------------------------------------------------------------

-- Abandoned holds stop blocking. Returns how many it released, which is what
-- the cron log shows.
create or replace function public.expire_stale_holds()
returns int
language sql
set search_path = pg_catalog, pg_temp
as $fn$
  with released as (
    update public.reservations
       set status = 'cancelled'
     where status = 'hold'
       and hold_expires_at < now()
    returning 1
  )
  select coalesce(count(*), 0)::int from released;
$fn$;

comment on function public.expire_stale_holds() is
  'Releases holds whose lifetime has run out. Called at the top of the write path and every five minutes by cron.';

-- ---------------------------------------------------------------------------
-- Availability now counts holds
-- ---------------------------------------------------------------------------
--
-- No `hold_expires_at > now()` filter here on purpose. The exclusion constraint
-- cannot apply one, so a read that filtered would show a night free that the
-- write path would still refuse. Being briefly over strict is the safe
-- direction, and the sweep keeps the window to minutes.
create or replace function public.busy_ranges(p_from date, p_to date default null)
returns table (b_kind text, b_ref uuid, b_start date, b_end date, b_platform text)
language sql
stable
set search_path = pg_catalog, pg_temp
as $fn$
  select 'reservation'::text, r.id, r.start_date, r.end_date, null::text
    from public.reservations r
   where r.status = 'confirmed'
     and daterange(r.start_date, r.end_date, '[)') && daterange(p_from, p_to, '[)')
  union all
  select 'hold'::text, r.id, r.start_date, r.end_date, null::text
    from public.reservations r
   where r.status = 'hold'
     and daterange(r.start_date, r.end_date, '[)') && daterange(p_from, p_to, '[)')
  union all
  select 'manual'::text, m.id, m.start_date, m.end_date, null::text
    from public.manual_blocks m
   where daterange(m.start_date, m.end_date, '[)') && daterange(p_from, p_to, '[)')
  union all
  select 'external'::text, e.id, e.start_date, e.end_date, e.platform
    from public.external_blocks e
   where daterange(e.start_date, e.end_date, '[)') && daterange(p_from, p_to, '[)')
  order by 3, 4;
$fn$;

-- The console names the strongest holder of a night. A hold sits just under a
-- confirmed booking: both are a guest, one has not paid yet.
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
  left join lateral (
    select b.b_kind, b.b_platform
      from busy b
     where n.n_night >= b.b_start and n.n_night < b.b_end
     order by case b.b_kind
                when 'reservation' then 1
                when 'hold' then 2
                when 'manual' then 3
                else 4
              end
     limit 1
  ) h on true
  order by n.n_night;
$fn$;

-- ---------------------------------------------------------------------------
-- The write path, now able to take a hold
-- ---------------------------------------------------------------------------
--
-- Still the only place a reservation is written. `p_hold_minutes` is the whole
-- change: left null it inserts a confirmed booking exactly as before, so the
-- Phase 2 enquiry route keeps working without being touched; given a lifetime
-- it inserts a hold instead, which is what the checkout takes before Stripe is
-- called.
--
-- Dropped rather than replaced: a new argument makes a second function and
-- PostgREST would then see two overloads of the same name.
drop function if exists public.create_direct_reservation(text, text, date, date, int, text, text, int);

create or replace function public.create_direct_reservation(
  p_guest_name text,
  p_guest_email text,
  p_start date,
  p_end date,
  p_party_size int default null,
  p_notes text default null,
  p_locale text default null,
  p_minors int default 0,
  p_hold_minutes int default null
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
begin
  -- Before anything is judged unavailable, give back the nights nobody is
  -- paying for. Cron does this too; doing it here is what keeps the answer
  -- immediate for the visitor standing in front of the calendar.
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

  begin
    insert into public.reservations
      (source, guest_name, guest_email, party_size, minors, start_date, end_date,
       notes, locale, status, hold_expires_at)
    values
      ('direct', p_guest_name, p_guest_email, p_party_size, coalesce(p_minors, 0),
       p_start, p_end, p_notes, p_locale, v_status, v_expires)
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

-- The hold a visitor already has on these nights.
--
-- Without this, coming back to a checkout is refused by the visitor's own hold:
-- the nights are busy, and busy is busy whoever put it there. Matching on the
-- email and the exact range, then pushing the expiry out, lets a reload or a
-- second attempt continue instead of colliding with itself.
create or replace function public.find_active_hold(
  p_guest_email text,
  p_start date,
  p_end date,
  p_extend_minutes int default null
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_id uuid;
  v_expires timestamptz;
begin
  perform public.expire_stale_holds();

  select r.id into v_id
    from public.reservations r
   where r.status = 'hold'
     and r.start_date = p_start
     and r.end_date = p_end
     and lower(r.guest_email) = lower(p_guest_email)
   order by r.created_at desc
   limit 1
     for update;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  if p_extend_minutes is not null and p_extend_minutes >= 1 then
    update public.reservations
       set hold_expires_at = now() + make_interval(mins => p_extend_minutes)
     where id = v_id
     returning hold_expires_at into v_expires;
  else
    select r.hold_expires_at into v_expires from public.reservations r where r.id = v_id;
  end if;

  return jsonb_build_object('found', true, 'id', v_id, 'hold_expires_at', v_expires);
end;
$fn$;

-- Hands the nights back. Used when Stripe refuses to open a payment at all, and
-- when a deposit has to be given back because the week went while the card was
-- being authorised.
create or replace function public.release_reservation_hold(p_reservation_id uuid)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_status text;
begin
  update public.reservations
     set status = 'cancelled'
   where id = p_reservation_id
     and status = 'hold'
  returning status into v_status;

  return jsonb_build_object('ok', true, 'released', v_status is not null);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Payment references
-- ---------------------------------------------------------------------------

-- Written when the payment intent is opened, before the card is ever charged,
-- so the webhook has somewhere to land whatever order things arrive in.
--
-- One row per reservation. Coming back to a checkout updates it rather than
-- adding a second, which is why the intent is reused rather than reopened: an
-- orphaned intent that later succeeded would be money with no booking to
-- attach it to.
create or replace function public.record_deposit_intent(
  p_reservation_id uuid,
  p_payment_intent_id text,
  p_customer_id text,
  p_deposit_amount numeric,
  p_balance_due numeric,
  p_balance_charge_on date,
  p_save_card_consent boolean,
  p_adults int,
  p_minors int,
  p_quote jsonb
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  insert into public.reservation_payments (
    reservation_id, stripe_payment_intent_id, stripe_customer_id,
    deposit_amount, balance_due, balance_charge_on,
    save_card_consent, adults, minors, quote)
  values (
    p_reservation_id, p_payment_intent_id, p_customer_id,
    p_deposit_amount, p_balance_due, p_balance_charge_on,
    coalesce(p_save_card_consent, false), p_adults, coalesce(p_minors, 0), p_quote)
  on conflict (reservation_id) do update
     set stripe_payment_intent_id = excluded.stripe_payment_intent_id,
         stripe_customer_id = excluded.stripe_customer_id,
         deposit_amount = excluded.deposit_amount,
         balance_due = excluded.balance_due,
         balance_charge_on = excluded.balance_charge_on,
         save_card_consent = excluded.save_card_consent,
         adults = excluded.adults,
         minors = excluded.minors,
         quote = excluded.quote,
         updated_at = now()
   -- A deposit already taken is final: nothing about it is rewritten by a
   -- stray second call.
   where reservation_payments.deposit_status <> 'paid';

  return jsonb_build_object('ok', true);
end;
$fn$;

-- The conversion, and the only place it happens.
--
-- Idempotent by construction: the payment row is locked, and the first caller
-- to find it unpaid is the only one that gets `converted: true`. The webhook
-- and the browser both call this, Stripe replays webhooks, and exactly one
-- email goes out.
create or replace function public.confirm_reservation_payment(
  p_payment_intent_id text,
  p_customer_id text default null,
  p_payment_method_id text default null
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_pay public.reservation_payments;
  v_res public.reservations;
  v_details jsonb;
begin
  select * into v_pay
    from public.reservation_payments
   where stripe_payment_intent_id = p_payment_intent_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_payment');
  end if;

  select * into v_res from public.reservations where id = v_pay.reservation_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_reservation');
  end if;

  v_details := jsonb_build_object(
    'reservation_id', v_res.id,
    'guest_name', v_res.guest_name,
    'guest_email', v_res.guest_email,
    'locale', v_res.locale,
    'start_date', v_res.start_date,
    'end_date', v_res.end_date,
    'party_size', v_res.party_size,
    'minors', v_res.minors,
    'notes', v_res.notes,
    'adults', v_pay.adults,
    'deposit_amount', v_pay.deposit_amount,
    'balance_due', v_pay.balance_due,
    'balance_charge_on', v_pay.balance_charge_on,
    'save_card_consent', v_pay.save_card_consent,
    'currency', v_pay.currency,
    'quote', v_pay.quote
  );

  -- Second caller. Nothing to do, and above all nothing to send.
  if v_pay.deposit_status = 'paid' then
    return jsonb_build_object('ok', true, 'converted', false) || v_details;
  end if;

  if v_res.status <> 'confirmed' then
    begin
      update public.reservations
         set status = 'confirmed'
       where id = v_res.id;
    exception when exclusion_violation then
      -- The hold was swept while the card was being authorised, and the week
      -- went to somebody else. The money has to go back; the caller does that
      -- and tells the host.
      return jsonb_build_object('ok', false, 'reason', 'unavailable') || v_details;
    end;
  end if;

  update public.reservation_payments
     set deposit_status = 'paid',
         deposit_paid_at = now(),
         stripe_customer_id = coalesce(p_customer_id, stripe_customer_id),
         stripe_payment_method_id = coalesce(p_payment_method_id, stripe_payment_method_id),
         last_error = null,
         updated_at = now()
   where reservation_id = v_pay.reservation_id;

  return jsonb_build_object('ok', true, 'converted', true) || v_details;
end;
$fn$;

-- A refused card. The hold is deliberately left alone: the visitor still has
-- the rest of its lifetime to try another one.
create or replace function public.mark_deposit_failed(
  p_payment_intent_id text,
  p_error text default null
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_updated int;
begin
  update public.reservation_payments
     set deposit_status = 'failed',
         last_error = left(coalesce(p_error, 'payment_failed'), 500),
         updated_at = now()
   where stripe_payment_intent_id = p_payment_intent_id
     and deposit_status <> 'paid';

  get diagnostics v_updated = row_count;
  return jsonb_build_object('ok', true, 'updated', v_updated);
end;
$fn$;

-- Marks a deposit given back, after the caller has refunded it at Stripe.
create or replace function public.mark_deposit_refunded(
  p_payment_intent_id text,
  p_reason text default null
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  update public.reservation_payments
     set deposit_status = 'refunded',
         balance_status = 'failed',
         last_error = left(coalesce(p_reason, 'refunded'), 500),
         updated_at = now()
   where stripe_payment_intent_id = p_payment_intent_id;

  return jsonb_build_object('ok', true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Grants. PostgREST publishes public functions; only the service role calls these.
-- ---------------------------------------------------------------------------

revoke all on function public.expire_stale_holds() from public, anon, authenticated;
revoke all on function public.find_active_hold(text, date, date, int) from public, anon, authenticated;
revoke all on function public.release_reservation_hold(uuid) from public, anon, authenticated;
revoke all on function public.record_deposit_intent(uuid, text, text, numeric, numeric, date, boolean, int, int, jsonb)
  from public, anon, authenticated;
revoke all on function public.confirm_reservation_payment(text, text, text) from public, anon, authenticated;
revoke all on function public.mark_deposit_failed(text, text) from public, anon, authenticated;
revoke all on function public.mark_deposit_refunded(text, text) from public, anon, authenticated;
revoke all on function public.create_direct_reservation(text, text, date, date, int, text, text, int, int)
  from public, anon, authenticated;

grant execute on function public.expire_stale_holds() to service_role;
grant execute on function public.find_active_hold(text, date, date, int) to service_role;
grant execute on function public.release_reservation_hold(uuid) to service_role;
grant execute on function public.record_deposit_intent(uuid, text, text, numeric, numeric, date, boolean, int, int, jsonb)
  to service_role;
grant execute on function public.confirm_reservation_payment(text, text, text) to service_role;
grant execute on function public.mark_deposit_failed(text, text) to service_role;
grant execute on function public.mark_deposit_refunded(text, text) to service_role;
grant execute on function public.create_direct_reservation(text, text, date, date, int, text, text, int, int)
  to service_role;

-- ---------------------------------------------------------------------------
-- The backstop sweep, and the one setting this lot decides
-- ---------------------------------------------------------------------------

select cron.unschedule('expire-holds') where exists (select 1 from cron.job where jobname = 'expire-holds');

select cron.schedule('expire-holds', '*/5 * * * *', $job$ select public.expire_stale_holds(); $job$);

-- When the balance is taken: a fortnight before arrival, late enough that a
-- cancellation has usually happened by then, early enough that a refused card
-- can still be chased before the guest is at the door.
update public.pricing_config
   set deposit_charge_days_before_arrival = 14,
       updated_at = now()
 where singleton
   and deposit_charge_days_before_arrival is null;
