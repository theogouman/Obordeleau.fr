-- Phase 3, lot 5: what is due, what is charged once, and what is never charged.
--
-- One transaction that always rolls back. Fixture stays sit in 2029, outside
-- every imported calendar, and dates that have to be relative to today are
-- written against booking_today() so the suite answers the same whatever day it
-- runs. Rows are inserted straight into the tables rather than through the
-- booking flow, because the point here is the state machine and not the write.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/balance.test.sql

begin;

create temporary table t_result (n int generated always as identity, name text, pass boolean, detail text)
  on commit drop;

create or replace function pg_temp.check_that(p_name text, p_pass boolean, p_detail text default null)
returns void language sql as $$
  insert into t_result (name, pass, detail) values (p_name, p_pass, p_detail);
$$;

-- A confirmed stay with a deposit behind it, and a balance waiting for its day.
create or replace function pg_temp.fixture(
  p_email text, p_start date, p_nights int, p_charge_on date,
  p_status text default 'pending', p_reservation_status text default 'confirmed')
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.reservations (guest_name, guest_email, party_size, minors,
                                   start_date, end_date, status, locale)
  values ('Balance Fixture', p_email, 2, 0,
          p_start, p_start + p_nights, p_reservation_status, 'fr')
  returning id into v_id;

  insert into public.reservation_payments (
    reservation_id, stripe_customer_id, stripe_payment_intent_id,
    stripe_payment_method_id, deposit_amount, deposit_status, deposit_paid_at,
    balance_due, balance_status, balance_charge_on, save_card_consent,
    adults, minors, quote)
  values (
    v_id, 'cus_' || replace(v_id::text, '-', ''), 'pi_dep_' || replace(v_id::text, '-', ''),
    'pm_' || replace(v_id::text, '-', ''), 150.00, 'paid', now(),
    206.16, p_status, p_charge_on, true, 2, 0, '{"frozen": true}'::jsonb);

  return v_id;
end;
$$;

do $suite$
declare
  v_due uuid;
  v_later uuid;
  v_off uuid;
  v_settled uuid;
  v_unpaid uuid;
  v_sca uuid;
  v_rows jsonb;
  v_again jsonb;
  v_settle jsonb;
  v_replay jsonb;
  v_token jsonb;
  v_token2 jsonb;
  v_lookup jsonb;
  v_today date := public.booking_today();
begin
  ------------------------------------------------------------------ what is due
  v_due     := pg_temp.fixture('due@example.test',      date '2029-02-05', 3, v_today);
  v_later   := pg_temp.fixture('later@example.test',    date '2029-02-20', 3, v_today + 20);
  v_off     := pg_temp.fixture('cancelled@example.test',date '2029-03-05', 3, v_today, 'pending', 'cancelled');
  v_settled := pg_temp.fixture('settled@example.test',  date '2029-03-20', 3, v_today, 'paid');
  v_unpaid  := pg_temp.fixture('nodeposit@example.test',date '2029-04-05', 3, v_today);

  -- The one whose deposit never cleared.
  update public.reservation_payments set deposit_status = 'pending' where reservation_id = v_unpaid;

  v_rows := public.claim_due_balances(50, 30, 2);

  perform pg_temp.check_that('1 the stay whose charge date has come is claimed',
    exists (select 1 from jsonb_array_elements(v_rows) e
             where (e ->> 'reservation_id')::uuid = v_due),
    v_rows::text);

  perform pg_temp.check_that('2 a charge date still in the future is not claimed',
    not exists (select 1 from jsonb_array_elements(v_rows) e
                 where (e ->> 'reservation_id')::uuid = v_later));

  perform pg_temp.check_that('3 a cancelled reservation is never charged',
    not exists (select 1 from jsonb_array_elements(v_rows) e
                 where (e ->> 'reservation_id')::uuid = v_off));

  perform pg_temp.check_that('4 a balance already paid is not claimed again',
    not exists (select 1 from jsonb_array_elements(v_rows) e
                 where (e ->> 'reservation_id')::uuid = v_settled));

  perform pg_temp.check_that('5 a stay whose deposit never cleared is not claimed',
    not exists (select 1 from jsonb_array_elements(v_rows) e
                 where (e ->> 'reservation_id')::uuid = v_unpaid));

  perform pg_temp.check_that('6 the claim carries the frozen amount and the saved card',
    exists (select 1 from jsonb_array_elements(v_rows) e
             where (e ->> 'reservation_id')::uuid = v_due
               and (e ->> 'balance_due')::numeric = 206.16
               and e ->> 'payment_method_id' is not null
               and e ->> 'customer_id' is not null
               and e ->> 'locale' = 'fr'));

  ------------------------------------------------------------- the claim holds
  v_again := public.claim_due_balances(50, 30, 2);

  perform pg_temp.check_that('7 a second run claims nothing already in flight',
    not exists (select 1 from jsonb_array_elements(v_again) e
                 where (e ->> 'reservation_id')::uuid = v_due),
    v_again::text);

  -- A runner that died without answering.
  update public.reservation_payments
     set balance_processing_at = now() - interval '1 hour'
   where reservation_id = v_due;

  v_again := public.claim_due_balances(50, 30, 2);

  perform pg_temp.check_that('8 a claim nobody released is taken back',
    exists (select 1 from jsonb_array_elements(v_again) e
             where (e ->> 'reservation_id')::uuid = v_due));

  ------------------------------------------------------- the bank wants the guest
  perform public.mark_balance_action_required(
    v_due, 'pi_balance_sca', 'authentication_required', 'the card issuer asked for 3D Secure', 3);

  perform pg_temp.check_that('9 authentication_required leaves the balance waiting on the guest',
    exists (select 1 from public.reservation_payments p
             where p.reservation_id = v_due
               and p.balance_status = 'action_required'
               and p.balance_attempts = 1
               and p.balance_processing_at is null
               and p.balance_next_attempt_at > now()
               and p.last_error is not null));

  perform pg_temp.check_that('10 and the attempt is in the log with its code',
    exists (select 1 from public.balance_charge_attempts a
             where a.reservation_id = v_due and a.kind = 'charge'
               and a.outcome = 'action_required'
               and a.stripe_code = 'authentication_required'
               and a.amount = 206.16));

  v_again := public.claim_due_balances(50, 30, 2);

  perform pg_temp.check_that('11 nothing is chased again before the wait is over',
    not exists (select 1 from jsonb_array_elements(v_again) e
                 where (e ->> 'reservation_id')::uuid = v_due));

  update public.reservation_payments
     set balance_next_attempt_at = now() - interval '1 minute'
   where reservation_id = v_due;

  v_again := public.claim_due_balances(50, 30, 2);

  perform pg_temp.check_that('12 once the wait is over it comes back for a reminder',
    exists (select 1 from jsonb_array_elements(v_again) e
             where (e ->> 'reservation_id')::uuid = v_due
               and e ->> 'balance_status' = 'action_required'));

  perform public.mark_balance_reminded(v_due, 3);
  update public.reservation_payments
     set balance_next_attempt_at = now() - interval '1 minute'
   where reservation_id = v_due;
  perform public.mark_balance_reminded(v_due, 3);
  update public.reservation_payments
     set balance_next_attempt_at = now() - interval '1 minute'
   where reservation_id = v_due;

  v_again := public.claim_due_balances(50, 30, 2);

  perform pg_temp.check_that('13 after two reminders it stops asking and waits for a person',
    not exists (select 1 from jsonb_array_elements(v_again) e
                 where (e ->> 'reservation_id')::uuid = v_due)
      and exists (select 1 from public.reservation_payments p
                   where p.reservation_id = v_due and p.balance_reminders_sent = 2));

  perform pg_temp.check_that('14 every reminder is in the log',
    (select count(*) from public.balance_charge_attempts a
      where a.reservation_id = v_due and a.kind = 'reminder') = 2);

  ------------------------------------------------------------------- the link
  v_token := public.ensure_balance_link_token(v_due);
  v_token2 := public.ensure_balance_link_token(v_due);

  perform pg_temp.check_that('15 the pay link is minted once and does not move',
    (v_token ->> 'ok')::boolean
      and v_token ->> 'token' is not null
      and length(v_token ->> 'token') > 20
      and v_token ->> 'token' = v_token2 ->> 'token',
    v_token::text);

  v_lookup := public.balance_by_link_token(v_token ->> 'token');

  perform pg_temp.check_that('16 the link resolves to the stay and its frozen amount',
    (v_lookup ->> 'found')::boolean
      and (v_lookup ->> 'reservation_id')::uuid = v_due
      and (v_lookup ->> 'balance_due')::numeric = 206.16
      and v_lookup ->> 'reservation_status' = 'confirmed',
    v_lookup::text);

  perform pg_temp.check_that('17 an invented token resolves to nothing',
    not (public.balance_by_link_token('not-a-real-token') ->> 'found')::boolean);

  perform public.record_balance_session(v_due, 'cs_test_balance');

  perform pg_temp.check_that('18 the session minted for a click is remembered for the webhook',
    exists (select 1 from public.reservation_payments p
             where p.reservation_id = v_due and p.stripe_balance_session_id = 'cs_test_balance')
      and exists (select 1 from public.balance_charge_attempts a
                   where a.reservation_id = v_due and a.kind = 'link'));

  ---------------------------------------------------------------- paid, once
  v_settle := public.settle_balance_payment(null, null, 'cs_test_balance', 'webhook');

  perform pg_temp.check_that('19 the webhook for that session settles the balance',
    (v_settle ->> 'ok')::boolean and (v_settle ->> 'changed')::boolean
      and (v_settle ->> 'reservation_id')::uuid = v_due
      and v_settle ->> 'guest_email' = 'due@example.test'
      and (v_settle ->> 'balance_due')::numeric = 206.16,
    v_settle::text);

  perform pg_temp.check_that('20 the row says paid, and the link is spent',
    exists (select 1 from public.reservation_payments p
             where p.reservation_id = v_due
               and p.balance_status = 'paid'
               and p.balance_paid_at is not null
               and p.balance_next_attempt_at is null
               and p.balance_link_token is null
               and p.balance_processing_at is null));

  v_replay := public.settle_balance_payment(null, null, 'cs_test_balance', 'webhook');

  perform pg_temp.check_that('21 a replayed webhook changes nothing and sends nothing',
    (v_replay ->> 'ok')::boolean and not (v_replay ->> 'changed')::boolean,
    v_replay::text);

  perform pg_temp.check_that('22 so exactly one receipt is owed',
    (select count(*) from public.balance_charge_attempts a
      where a.reservation_id = v_due and a.outcome = 'paid') = 1);

  perform pg_temp.check_that('23 the spent link stops opening anything',
    not (public.balance_by_link_token(v_token ->> 'token') ->> 'found')::boolean);

  perform pg_temp.check_that('24 a paid balance cannot be walked back to failed',
    (public.mark_balance_failed(v_due, 'pi_late', 'card_declined', 'too late') ->> 'ok')::boolean
      and exists (select 1 from public.reservation_payments p
                   where p.reservation_id = v_due and p.balance_status = 'paid'));

  ---------------------------------------------------- a card that simply says no
  v_sca := pg_temp.fixture('declined@example.test', date '2029-05-05', 3, v_today);
  v_rows := public.claim_due_balances(50, 30, 2);

  perform public.mark_balance_failed(v_sca, 'pi_balance_declined', 'card_declined', 'Your card was declined.', 3);

  perform pg_temp.check_that('25 a refused card is recorded, with the reason kept',
    exists (select 1 from public.reservation_payments p
             where p.reservation_id = v_sca
               and p.balance_status = 'failed'
               and p.balance_attempts = 1
               and p.balance_processing_at is null
               and p.last_error = 'Your card was declined.'));

  perform pg_temp.check_that('26 and the console puts what needs a person first',
    (select b.b_status from public.admin_balances(60) b limit 1) = 'failed');

  ------------------------------------------------------- settling by intent id
  v_settle := public.settle_balance_payment(null, 'pi_balance_declined', null, 'charge');

  perform pg_temp.check_that('27 a later success on the same intent settles it',
    (v_settle ->> 'ok')::boolean and (v_settle ->> 'changed')::boolean
      and (v_settle ->> 'reservation_id')::uuid = v_sca);

  perform pg_temp.check_that('28 a reference nobody opened settles nothing',
    public.settle_balance_payment(null, 'pi_never_seen', null, 'webhook') ->> 'reason'
      = 'unknown_balance');

  ----------------------------------------------------------- the frozen amount
  update public.pricing_config set base_nightly_rate = 999.00 where singleton;

  perform pg_temp.check_that('29 a rate changed since is not what gets charged',
    exists (select 1 from public.reservation_payments p
             where p.reservation_id = v_later and p.balance_due = 206.16));

  -- Called on its own line, and asserted on the next. A volatile function's
  -- writes are not visible to the rest of the statement that called it, so
  -- asking in the same expression would read the snapshot from before it ran.
  perform public.release_balance_claim(v_later, 'nothing to do');

  perform pg_temp.check_that('30 a released claim is free to be picked up again, and says why',
    exists (select 1 from public.reservation_payments p
             where p.reservation_id = v_later and p.balance_processing_at is null)
      and exists (select 1 from public.balance_charge_attempts a
                   where a.reservation_id = v_later
                     and a.outcome = 'skipped' and a.detail = 'nothing to do'));
end;
$suite$;

select n, case when pass then 'ok' else 'FAIL' end as result, name, detail
  from t_result where not pass order by n;

select count(*) filter (where not pass) as failures, count(*) as total from t_result;

rollback;
