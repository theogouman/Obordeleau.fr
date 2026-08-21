-- Phase 3, lot 4: the hold, the conversion, and the guard rails around them.
--
-- One transaction that always rolls back, so it can be pointed at any
-- environment without leaving a reservation, a payment or a price behind.
-- Fixture dates sit in February 2029, outside every imported calendar and
-- outside the summer seasons, so the off season rule applies: two nights
-- minimum, any arrival day.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/payments.test.sql

begin;

-- A rate, so get_quote can answer at all. Production leaves this NULL until the
-- owner sets it, and the money path fails closed rather than guessing.
update public.pricing_config
   set base_nightly_rate = 100.00,
       cleaning_fee = 45.00,
       deposit_charge_days_before_arrival = 14
 where singleton;

create temporary table t_result (n int generated always as identity, name text, pass boolean, detail text)
  on commit drop;

create or replace function pg_temp.check_that(p_name text, p_pass boolean, p_detail text default null)
returns void language sql as $$
  insert into t_result (name, pass, detail) values (p_name, p_pass, p_detail);
$$;

do $suite$
declare
  v_from date := date '2029-02-05';
  v_to   date := date '2029-02-08';
  v_hold jsonb;
  v_other jsonb;
  v_found jsonb;
  v_quote jsonb;
  v_confirm jsonb;
  v_again jsonb;
  v_id uuid;
  v_intent text := 'pi_test_lot4_deposit';
  v_released int;
  v_kinds text[];
  v_stay jsonb;
  v_failed boolean;
begin
  ------------------------------------------------------------------ the hold
  v_hold := public.create_direct_reservation(
    'Test Hold', 'hold@example.test', v_from, v_to, 2, null, 'fr', 0, 25);

  perform pg_temp.check_that('1 a checkout takes a hold, not a booking',
    (v_hold ->> 'ok')::boolean and v_hold ->> 'status' = 'hold'
      and (v_hold ->> 'hold_expires_at') is not null,
    v_hold::text);

  v_id := (v_hold ->> 'id')::uuid;

  perform pg_temp.check_that('2 the hold is a real row with an expiry',
    exists (select 1 from public.reservations r
             where r.id = v_id and r.status = 'hold' and r.hold_expires_at > now()));

  ------------------------------------------------- a hold blocks, like a booking
  v_other := public.create_direct_reservation(
    'Second Visitor', 'second@example.test', v_from, v_to, 2, null, 'fr', 0, 25);

  perform pg_temp.check_that('3 a second checkout on the same week is refused before Stripe',
    not (v_other ->> 'ok')::boolean and v_other ->> 'reason' = 'unavailable',
    v_other::text);

  v_other := public.create_direct_reservation(
    'Enquiry Path', 'enquiry@example.test', v_from, v_to, 2, null, 'fr', 0, null);

  perform pg_temp.check_that('4 the no payment write path is blocked by a hold too',
    not (v_other ->> 'ok')::boolean and v_other ->> 'reason' = 'unavailable');

  v_other := public.create_direct_reservation(
    'Overlapper', 'over@example.test', v_from - 1, v_from + 1, 2, null, 'fr', 0, 25);

  perform pg_temp.check_that('5 an overlapping range is refused, not only an identical one',
    not (v_other ->> 'ok')::boolean and v_other ->> 'reason' = 'unavailable');

  ------------------------------------------------------- the reads agree with it
  v_stay := public.validate_stay(v_from, v_to);
  perform pg_temp.check_that('6 validate_stay calls held nights unavailable',
    not (v_stay ->> 'valid')::boolean and v_stay ->> 'reason' = 'unavailable',
    v_stay::text);

  select array_agg(distinct b.b_kind) into v_kinds
    from public.busy_ranges(v_from, v_to) b;

  perform pg_temp.check_that('7 busy_ranges names the holder a hold',
    v_kinds @> array['hold'], v_kinds::text);

  perform pg_temp.check_that('8 the console calendar shows the night held',
    exists (select 1 from public.admin_calendar(v_from, v_to) c
             where c.c_night = v_from and c.c_busy = 'hold'));

  ------------------------------------------------------- coming back to a checkout
  v_found := public.find_active_hold('HOLD@EXAMPLE.TEST', v_from, v_to, 30);

  perform pg_temp.check_that('9 a returning visitor finds their own hold, case insensitively',
    (v_found ->> 'found')::boolean and (v_found ->> 'id')::uuid = v_id,
    v_found::text);

  perform pg_temp.check_that('10 finding it pushes the expiry out',
    (v_found ->> 'hold_expires_at')::timestamptz > now() + interval '25 minutes');

  perform pg_temp.check_that('11 somebody else does not find it',
    not (public.find_active_hold('stranger@example.test', v_from, v_to, 30) ->> 'found')::boolean);

  ------------------------------------------------------------------- the amounts
  v_quote := public.get_quote(v_from, v_to, 2, 0);

  perform pg_temp.check_that('12 the deposit is half the accommodation alone',
    (v_quote ->> 'accommodation_subtotal')::numeric = 300.00
      and (v_quote ->> 'deposit_amount')::numeric = 150.00,
    v_quote::text);

  perform pg_temp.check_that('13 the balance is the rest of the accommodation, the whole tax and the cleaning',
    (v_quote ->> 'balance_amount')::numeric
      = 150.00 + (v_quote ->> 'tourist_tax')::numeric + (v_quote ->> 'cleaning_fee')::numeric,
    v_quote::text);

  perform public.record_deposit_intent(
    v_id, v_intent, 'cus_test_lot4',
    (v_quote ->> 'deposit_amount')::numeric,
    (v_quote ->> 'balance_amount')::numeric,
    v_from - 14, true, 2, 0, v_quote);

  perform pg_temp.check_that('14 balance_due is frozen on the reservation, ready for lot 5',
    exists (select 1 from public.reservation_payments p
             where p.reservation_id = v_id
               and p.balance_due = (v_quote ->> 'balance_amount')::numeric
               and p.balance_charge_on = v_from - 14
               and p.balance_status = 'pending'
               and p.deposit_status = 'pending'));

  ----------------------------------------------------------------- a refused card
  perform public.mark_deposit_failed(v_intent, 'card_declined');

  select (p.deposit_status = 'failed') into v_failed
    from public.reservation_payments p where p.reservation_id = v_id;

  perform pg_temp.check_that('15 a refused card is recorded', coalesce(v_failed, false));

  perform pg_temp.check_that('16 a refused card leaves the hold standing, so another can be tried',
    exists (select 1 from public.reservations r where r.id = v_id and r.status = 'hold'));

  ------------------------------------------------------------------ the conversion
  v_confirm := public.confirm_reservation_payment(v_intent, 'cus_test_lot4', 'pm_test_lot4');

  perform pg_temp.check_that('17 the deposit converts the hold into a booking',
    (v_confirm ->> 'ok')::boolean and (v_confirm ->> 'converted')::boolean
      and exists (select 1 from public.reservations r where r.id = v_id and r.status = 'confirmed'),
    v_confirm::text);

  perform pg_temp.check_that('18 the card is kept where lot 5 will look for it',
    exists (select 1 from public.reservation_payments p
             where p.reservation_id = v_id
               and p.stripe_customer_id = 'cus_test_lot4'
               and p.stripe_payment_method_id = 'pm_test_lot4'
               and p.deposit_status = 'paid'
               and p.deposit_paid_at is not null));

  v_again := public.confirm_reservation_payment(v_intent, 'cus_test_lot4', 'pm_test_lot4');

  perform pg_temp.check_that('19 a replayed webhook converts nothing and sends nothing',
    (v_again ->> 'ok')::boolean and not (v_again ->> 'converted')::boolean,
    v_again::text);

  perform pg_temp.check_that('20 an intent nobody opened is not a booking',
    public.confirm_reservation_payment('pi_never_seen') ->> 'reason' = 'unknown_payment');

  ------------------------------------------------------------------- the sweep
  -- A second week, abandoned at the card form.
  v_hold := public.create_direct_reservation(
    'Abandoned', 'gone@example.test', date '2029-03-05', date '2029-03-08', 2, null, 'fr', 0, 25);

  update public.reservations
     set hold_expires_at = now() - interval '1 minute'
   where id = (v_hold ->> 'id')::uuid;

  v_released := public.expire_stale_holds();

  perform pg_temp.check_that('21 an abandoned hold is released by the sweep', v_released >= 1);

  perform pg_temp.check_that('22 and the nights are bookable again',
    (public.validate_stay(date '2029-03-05', date '2029-03-08') ->> 'valid')::boolean);

  perform pg_temp.check_that('23 the sweep does not touch a live hold or a booking',
    exists (select 1 from public.reservations r where r.id = v_id and r.status = 'confirmed'));

  --------------------------------------------- the deposit that has to go back
  -- The hold was swept while the card was being authorised, and the week went.
  v_hold := public.create_direct_reservation(
    'Slow Card', 'slow@example.test', date '2029-04-02', date '2029-04-05', 2, null, 'fr', 0, 25);
  v_id := (v_hold ->> 'id')::uuid;

  perform public.record_deposit_intent(
    v_id, 'pi_test_lot4_slow', 'cus_slow', 150.00, 195.58, date '2029-03-19', true, 2, 0, '{}'::jsonb);

  update public.reservations set hold_expires_at = now() - interval '1 minute' where id = v_id;
  perform public.expire_stale_holds();

  perform public.create_direct_reservation(
    'Faster', 'faster@example.test', date '2029-04-02', date '2029-04-05', 2, null, 'fr', 0, null);

  v_confirm := public.confirm_reservation_payment('pi_test_lot4_slow', 'cus_slow', 'pm_slow');

  perform pg_temp.check_that('24 a deposit paid for a week that has gone is refused, with enough to refund it',
    not (v_confirm ->> 'ok')::boolean
      and v_confirm ->> 'reason' = 'unavailable'
      and v_confirm ->> 'guest_email' = 'slow@example.test',
    v_confirm::text);

  perform pg_temp.check_that('25 and the booking is not resurrected under the other guest',
    exists (select 1 from public.reservations r
             where r.start_date = date '2029-04-02' and r.status = 'confirmed'
               and r.guest_email = 'faster@example.test')
      and exists (select 1 from public.reservations r
                   where r.id = v_id and r.status = 'cancelled'));

  ----------------------------------------------------------------- the capacity
  begin
    insert into public.reservations (guest_name, guest_email, party_size, start_date, end_date)
    values ('Too Many', 'many@example.test', 5, date '2029-05-07', date '2029-05-10');
    perform pg_temp.check_that('26 five people cannot be written into a studio for four', false,
      'the insert succeeded');
  exception when check_violation then
    perform pg_temp.check_that('26 five people cannot be written into a studio for four', true);
  end;

  ------------------------------------------------- the enquiry path is untouched
  v_other := public.create_direct_reservation(
    'Enquiry', 'enquiry2@example.test', date '2029-06-04', date '2029-06-07', 2, null, 'fr', 0);

  perform pg_temp.check_that('27 called without a hold lifetime, the write path still confirms outright',
    (v_other ->> 'ok')::boolean and v_other ->> 'status' = 'confirmed'
      and exists (select 1 from public.reservations r
                   where r.id = (v_other ->> 'id')::uuid
                     and r.status = 'confirmed' and r.hold_expires_at is null),
    v_other::text);

  ----------------------------------------------------- the stay rule still rules
  v_other := public.create_direct_reservation(
    'One Night', 'one@example.test', date '2029-06-20', date '2029-06-21', 2, null, 'fr', 0, 25);

  perform pg_temp.check_that('28 a hold cannot be taken on a stay the rule refuses',
    not (v_other ->> 'ok')::boolean and v_other ->> 'reason' = 'min_nights',
    v_other::text);

  v_other := public.create_direct_reservation(
    'Tuesday In July', 'tue@example.test', date '2029-07-03', date '2029-07-10', 2, null, 'fr', 0, 25);

  perform pg_temp.check_that('29 nor on a Tuesday arrival in July',
    not (v_other ->> 'ok')::boolean and v_other ->> 'reason' = 'checkin_day',
    v_other::text);
end;
$suite$;

select n, case when pass then 'ok  ' else 'FAIL' end as result, name, detail
  from t_result order by n;

select count(*) filter (where not pass) as failures, count(*) as total from t_result;

rollback;
