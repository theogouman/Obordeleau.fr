-- Phase 3: when a deposit is worth taking, and when the stay is simply paid for.
--
-- A deposit is not free. It buys a saved card, an off session charge months
-- later, a fallback when the bank asks for the cardholder, and a chase when it
-- refuses. That machinery earns its keep on a distant, expensive stay. On a
-- week booked for the weekend after next, or on a short stay of a couple of
-- hundred euros, it is cost and risk for nothing.
--
-- Worse than pointless, it was wrong. The balance was scheduled at arrival
-- minus fourteen days with no floor under it, so a stay booked inside that
-- fortnight produced a charge date that had already gone: a mandate shown to
-- the guest with a date in the past, and a balance due the moment it was
-- agreed. The last minute discount window makes exactly those bookings common.
--
-- So the rule below, and an invariant under it that makes the old bug
-- unrepresentable rather than merely fixed: a quote can no longer carry a
-- charge date that is not in the future, whatever the configuration says.

-- ---------------------------------------------------------------------------
-- The two thresholds
-- ---------------------------------------------------------------------------

alter table public.pricing_config
  add column if not exists deposit_min_advance_days int not null default 30,
  -- Compared against the total, cleaning and tourist tax included, because that
  -- is the figure that decides whether the recovery machinery is worth running.
  add column if not exists deposit_min_total numeric(10,2) not null default 500;

comment on column public.pricing_config.deposit_min_advance_days is
  'A deposit is only offered above this many days before arrival. Strictly above: the exact boundary is paid in full.';
comment on column public.pricing_config.deposit_min_total is
  'A deposit is only offered above this total, tax and cleaning included. Strictly above: the exact boundary is paid in full.';

alter table public.pricing_config
  drop constraint if exists pricing_config_deposit_min_advance;
alter table public.pricing_config
  add constraint pricing_config_deposit_min_advance check (deposit_min_advance_days >= 0);

alter table public.pricing_config
  drop constraint if exists pricing_config_deposit_min_total;
alter table public.pricing_config
  add constraint pricing_config_deposit_min_total check (deposit_min_total >= 0);

-- The two settings have to stay in that order. A deposit offered closer to
-- arrival than the balance is taken would schedule the balance for a day that
-- has passed, which is the whole of the bug this migration exists for. The
-- quote refuses that case on its own; this refuses to store it at all.
alter table public.pricing_config
  drop constraint if exists pricing_config_deposit_window;
alter table public.pricing_config
  add constraint pricing_config_deposit_window check (
    deposit_charge_days_before_arrival is null
    or deposit_min_advance_days > deposit_charge_days_before_arrival);

-- ---------------------------------------------------------------------------
-- A balance that does not exist
-- ---------------------------------------------------------------------------
--
-- Paid in full leaves a payment row with nothing left to take. It cannot be
-- left as `pending`, which is what the runner reads as "waiting for its date":
-- it gets a status of its own that no query selects.
alter table public.reservation_payments
  drop constraint if exists reservation_payments_balance_status_check;

alter table public.reservation_payments
  add constraint reservation_payments_balance_status_check
  check (balance_status in ('pending', 'paid', 'action_required', 'failed', 'none'));

comment on column public.reservation_payments.balance_status is
  'none means the stay was paid in full at booking: there is no balance, and nothing selects it.';

-- ---------------------------------------------------------------------------
-- The quote
-- ---------------------------------------------------------------------------

create or replace function public.get_quote(
  p_check_in date,
  p_check_out date,
  p_adults int,
  p_minors int default 0
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_nights int;
  v_cleaning numeric(10,2);
  v_tax_rate numeric(10,2);
  v_deposit_pct numeric(5,2);
  v_charge_days int;
  v_min_advance int;
  v_min_total numeric(10,2);
  v_today date;
  v_advance int;
  v_subtotal numeric(12,2);
  v_tax numeric(12,2);
  v_total numeric(12,2);
  v_deposit numeric(12,2);
  v_balance numeric(12,2);
  v_charge_on date;
  v_mode text;
  v_rows jsonb;
  v_unpriced int;
begin
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  if p_adults is null or p_adults < 1 then
    raise exception 'invalid_adults' using errcode = '22023';
  end if;
  if p_minors is null or p_minors < 0 then
    raise exception 'invalid_minors' using errcode = '22023';
  end if;

  select c.cleaning_fee, c.tourist_tax_per_adult_night, c.deposit_percentage,
         c.deposit_charge_days_before_arrival, c.deposit_min_advance_days,
         c.deposit_min_total
    into v_cleaning, v_tax_rate, v_deposit_pct, v_charge_days, v_min_advance,
         v_min_total
    from public.pricing_config c
   where c.singleton;

  if not found then
    raise exception 'pricing_not_configured' using errcode = '22023';
  end if;

  select
    jsonb_agg(jsonb_build_object(
      'date', n.n_night, 'resolved_price', n.n_price, 'layer', n.n_layer)
      order by n.n_night),
    coalesce(sum(n.n_price), 0::numeric),
    count(*) filter (where n.n_price is null)
    into v_rows, v_subtotal, v_unpriced
    from public.resolve_nightly_prices(p_check_in, p_check_out) n;

  -- Fail closed. A night whose winning layer has no rate cannot be sold.
  if v_unpriced > 0 then
    raise exception 'pricing_not_configured'
      using errcode = '22023',
            detail = format('%s night(s) in the range have no configured rate', v_unpriced);
  end if;

  v_nights := p_check_out - p_check_in;
  v_subtotal := round(v_subtotal, 2);
  -- Minors under 18 are exempt from the tourist tax, so only adults count.
  v_tax := round(v_tax_rate * p_adults * v_nights, 2);
  v_total := round(v_subtotal + v_cleaning + v_tax, 2);

  v_today := public.booking_today();
  v_advance := p_check_in - v_today;

  -- Paid in full is the default, and every branch below has to earn its way out
  -- of it. Nothing here can produce a charge date, so nothing here can produce
  -- one in the past.
  v_mode := 'full';
  v_deposit := v_total;
  v_balance := 0;
  v_charge_on := null;

  -- A deposit is offered only when the arrival is far enough off and the stay
  -- is dear enough to be worth collecting in two parts. Both comparisons are
  -- strict, so the exact boundary is paid in full.
  if v_charge_days is not null
     and v_advance > coalesce(v_min_advance, 0)
     and v_total > coalesce(v_min_total, 0)
  then
    v_charge_on := p_check_in - v_charge_days;

    -- The invariant. With the thresholds in their configured order this cannot
    -- fail, and it is here so that no future ordering of them can put a charge
    -- date on a day that has already gone. A deposit of nothing is the same
    -- refusal wearing a different hat: taking zero today confirms a stay for
    -- free, which is the one thing this money path will not do.
    if v_charge_on > v_today
       and round(v_subtotal * v_deposit_pct / 100, 2) > 0
    then
      v_mode := 'deposit';
      -- The deposit bites on the accommodation alone. Cleaning and tax ride in
      -- the balance, which is what the balance run charges before arrival.
      v_deposit := round(v_subtotal * v_deposit_pct / 100, 2);
      v_balance := round(v_total - v_deposit, 2);
    else
      v_charge_on := null;
    end if;
  end if;

  return jsonb_build_object(
    'check_in', p_check_in,
    'check_out', p_check_out,
    'nights_count', v_nights,
    'adults', p_adults,
    'minors', p_minors,
    'nights', coalesce(v_rows, '[]'::jsonb),
    'accommodation_subtotal', v_subtotal,
    'cleaning_fee', v_cleaning,
    'tourist_tax', v_tax,
    'total', v_total,
    -- 'deposit' takes a share now and the rest before arrival. 'full' takes the
    -- whole stay today and leaves nothing to collect, so no card is kept.
    'payment_mode', v_mode,
    'deposit_percentage', v_deposit_pct,
    'deposit_amount', v_deposit,
    'balance_amount', v_balance,
    'balance_charge_days_before_arrival',
      case when v_mode = 'deposit' then v_charge_days else null end,
    'balance_charge_on', v_charge_on,
    'currency', 'EUR'
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Nothing selects a balance that does not exist
-- ---------------------------------------------------------------------------
--
-- The runner already required `balance_due > 0`, so a stay paid in full was
-- never going to be charged twice. Naming the status as well makes the rule
-- readable where it is applied rather than inferred from an amount.
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
       and p.balance_status not in ('paid', 'none')
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

-- The console lists what is outstanding and what settled recently. A stay paid
-- in full has neither, so it is not a line waiting for attention.
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
   and p.balance_status <> 'none'
   and (p.balance_status <> 'paid' or p.balance_paid_at > now() - interval '90 days')
 order by
   case p.balance_status
     when 'failed' then 1
     when 'action_required' then 2
     when 'pending' then 3
     else 4
   end,
   p.balance_charge_on
 limit p_limit;
$fn$;

-- The payment row is opened before the card is charged, so the status has to be
-- right from the start: a row written as pending with nothing due would be
-- picked up by the very next run.
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
declare
  v_balance numeric := coalesce(p_balance_due, 0);
  v_status text := case when coalesce(p_balance_due, 0) > 0 then 'pending' else 'none' end;
  -- No balance, no reason to keep a card, whatever the browser sent up.
  v_consent boolean := coalesce(p_save_card_consent, false) and coalesce(p_balance_due, 0) > 0;
begin
  insert into public.reservation_payments (
    reservation_id, stripe_payment_intent_id, stripe_customer_id,
    deposit_amount, balance_due, balance_status, balance_charge_on,
    save_card_consent, adults, minors, quote)
  values (
    p_reservation_id, p_payment_intent_id, p_customer_id,
    p_deposit_amount, v_balance, v_status,
    case when v_balance > 0 then p_balance_charge_on else null end,
    v_consent, p_adults, coalesce(p_minors, 0), p_quote)
  on conflict (reservation_id) do update
     set stripe_payment_intent_id = excluded.stripe_payment_intent_id,
         stripe_customer_id = excluded.stripe_customer_id,
         deposit_amount = excluded.deposit_amount,
         balance_due = excluded.balance_due,
         balance_status = excluded.balance_status,
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

-- ---------------------------------------------------------------------------
-- The console's read and write surface
-- ---------------------------------------------------------------------------
--
-- Dropped rather than replaced: two more arguments make a second function, and
-- PostgREST would then see two overloads of the same name.
drop function if exists public.admin_save_pricing_config(numeric, numeric, numeric, numeric, int, int);

create or replace function public.admin_save_pricing_config(
  p_base_nightly_rate numeric,
  p_cleaning_fee numeric,
  p_tourist_tax_per_adult_night numeric,
  p_deposit_percentage numeric,
  p_deposit_charge_days_before_arrival int,
  p_deposit_min_advance_days int,
  p_deposit_min_total numeric,
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
  if p_deposit_min_advance_days is null or p_deposit_min_advance_days < 0 then
    return jsonb_build_object('ok', false, 'reason', 'deposit_min_advance_days');
  end if;
  if p_deposit_min_total is null or p_deposit_min_total < 0 then
    return jsonb_build_object('ok', false, 'reason', 'deposit_min_total');
  end if;
  -- Refused rather than warned about. The other order is what produced a
  -- balance dated in the past, and the console is where it would be typed.
  if p_deposit_charge_days_before_arrival is not null
     and p_deposit_min_advance_days <= p_deposit_charge_days_before_arrival then
    return jsonb_build_object('ok', false, 'reason', 'deposit_window');
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
         deposit_min_advance_days = p_deposit_min_advance_days,
         deposit_min_total = p_deposit_min_total,
         default_min_nights = p_default_min_nights,
         updated_at = now()
   where singleton;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing_row');
  end if;

  return jsonb_build_object('ok', true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.admin_save_pricing_config(numeric, numeric, numeric, numeric, int, int, numeric, int)
  from public, anon, authenticated;
grant execute on function public.admin_save_pricing_config(numeric, numeric, numeric, numeric, int, int, numeric, int)
  to service_role;
