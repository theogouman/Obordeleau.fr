-- The deposit rule, exercised against the real engine.
--
-- Run it whole against the project: it saves the configuration, walks the
-- matrix, and puts the configuration back before it returns. Nothing here is
-- part of a migration; it is the proof that the branches go the way they are
-- meant to, kept so it can be run again after any change to get_quote.
--
--   psql "$DATABASE_URL" -f supabase/tests/deposit_threshold.sql
--
-- Every case reports what it got rather than asserting a hard figure, because
-- the rates are the owner's to change. The booleans are the assertions:
-- charge_in_future, parts_add_up, deposit_is_total and no_past_date must all
-- come back true, and the modes must read as they are named in the case.

create or replace function public._deposit_matrix()
returns jsonb
language plpgsql
as $t$
declare
  v_cfg public.pricing_config;
  v_out jsonb := '[]'::jsonb;
  v_today date := public.booking_today();
  v_q jsonb;
  v_total numeric;
begin
  select * into v_cfg from public.pricing_config where singleton;

  -- 1. far and dear: a deposit, with a charge date in the future
  v_q := public.get_quote(v_today + 44, v_today + 51, 2, 0);
  v_out := v_out || jsonb_build_object('case', '1 far and dear',
    'advance', 44, 'mode', v_q->>'payment_mode', 'total', v_q->>'total',
    'deposit', v_q->>'deposit_amount', 'balance', v_q->>'balance_amount',
    'charge_on', v_q->>'balance_charge_on',
    'charge_in_future', (v_q->>'balance_charge_on')::date > v_today,
    'parts_add_up', round((v_q->>'deposit_amount')::numeric + (v_q->>'balance_amount')::numeric, 2)
                      = (v_q->>'total')::numeric);

  -- 2. far but cheap: paid in full
  v_q := public.get_quote(v_today + 44, v_today + 46, 1, 0);
  v_out := v_out || jsonb_build_object('case', '2 far and cheap',
    'advance', 44, 'mode', v_q->>'payment_mode', 'total', v_q->>'total',
    'deposit', v_q->>'deposit_amount', 'balance', v_q->>'balance_amount',
    'charge_on', v_q->>'balance_charge_on',
    'deposit_is_total', (v_q->>'deposit_amount')::numeric = (v_q->>'total')::numeric);

  -- 3. the stay that reported the bug: booked inside the fortnight window
  v_q := public.get_quote(date '2026-09-01', date '2026-09-22', 2, 0);
  v_out := v_out || jsonb_build_object('case', '3 the reported stay',
    'advance', date '2026-09-01' - v_today, 'mode', v_q->>'payment_mode',
    'total', v_q->>'total', 'deposit', v_q->>'deposit_amount',
    'balance', v_q->>'balance_amount', 'charge_on', v_q->>'balance_charge_on',
    'no_past_date', v_q->>'balance_charge_on' is null);

  -- 4a. exactly on the day threshold: full
  v_q := public.get_quote(v_today + 30, v_today + 44, 2, 0);
  v_out := v_out || jsonb_build_object('case', '4a exactly 30 days',
    'advance', 30, 'mode', v_q->>'payment_mode', 'total', v_q->>'total',
    'charge_on', v_q->>'balance_charge_on');

  -- 4b. one day past it: deposit
  v_q := public.get_quote(v_today + 31, v_today + 45, 2, 0);
  v_out := v_out || jsonb_build_object('case', '4b 31 days',
    'advance', 31, 'mode', v_q->>'payment_mode', 'total', v_q->>'total',
    'charge_on', v_q->>'balance_charge_on');

  -- 4c. exactly on the money threshold: full
  v_q := public.get_quote(v_today + 44, v_today + 51, 2, 0);
  v_total := (v_q->>'total')::numeric;
  update public.pricing_config set deposit_min_total = v_total where singleton;
  v_q := public.get_quote(v_today + 44, v_today + 51, 2, 0);
  v_out := v_out || jsonb_build_object('case', '4c total equals the threshold',
    'threshold', v_total, 'total', v_q->>'total', 'mode', v_q->>'payment_mode');

  -- 4d. a cent over it: deposit
  update public.pricing_config set deposit_min_total = v_total - 0.01 where singleton;
  v_q := public.get_quote(v_today + 44, v_today + 51, 2, 0);
  v_out := v_out || jsonb_build_object('case', '4d total one cent over',
    'threshold', v_total - 0.01, 'total', v_q->>'total', 'mode', v_q->>'payment_mode');

  -- 8. the console moves a threshold, the branch moves with it
  update public.pricing_config
     set deposit_min_total = v_cfg.deposit_min_total, deposit_min_advance_days = 60
   where singleton;
  v_q := public.get_quote(v_today + 44, v_today + 51, 2, 0);
  v_out := v_out || jsonb_build_object('case', '8 advance threshold raised to 60',
    'advance', 44, 'mode', v_q->>'payment_mode', 'charge_on', v_q->>'balance_charge_on');

  -- 5. the invariant. The guard rail is taken off on purpose, so that the
  -- configuration it exists to prevent can be built and the quote can be shown
  -- refusing it on its own.
  alter table public.pricing_config drop constraint pricing_config_deposit_window;
  update public.pricing_config
     set deposit_min_advance_days = 5, deposit_charge_days_before_arrival = 14
   where singleton;
  v_q := public.get_quote(v_today + 8, v_today + 22, 2, 0);
  v_out := v_out || jsonb_build_object('case', '5 invariant, charge date would be in the past',
    'advance', 8, 'min_advance', 5, 'charge_days', 14,
    'mode', v_q->>'payment_mode', 'charge_on', v_q->>'balance_charge_on',
    'no_past_date', v_q->>'balance_charge_on' is null);

  -- everything back as it was
  update public.pricing_config
     set base_nightly_rate = v_cfg.base_nightly_rate,
         cleaning_fee = v_cfg.cleaning_fee,
         tourist_tax_per_adult_night = v_cfg.tourist_tax_per_adult_night,
         deposit_percentage = v_cfg.deposit_percentage,
         deposit_charge_days_before_arrival = v_cfg.deposit_charge_days_before_arrival,
         deposit_min_advance_days = v_cfg.deposit_min_advance_days,
         deposit_min_total = v_cfg.deposit_min_total,
         default_min_nights = v_cfg.default_min_nights,
         updated_at = v_cfg.updated_at
   where singleton;

  alter table public.pricing_config
    add constraint pricing_config_deposit_window check (
      deposit_charge_days_before_arrival is null
      or deposit_min_advance_days > deposit_charge_days_before_arrival);

  return jsonb_build_object('today', v_today, 'cases', v_out);
end;
$t$;

select jsonb_pretty(public._deposit_matrix()) as report;

drop function public._deposit_matrix();
