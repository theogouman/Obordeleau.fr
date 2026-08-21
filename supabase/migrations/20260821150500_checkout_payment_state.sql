-- Phase 3, lot 4: what the checkout already knows about a hold.
--
-- Coming back to a checkout has to reuse the payment intent that is already
-- open rather than opening a second one. An abandoned intent that later
-- succeeded would be money with no booking to attach it to: the webhook would
-- find a row pointing at a different intent and would have nothing to convert.
--
-- So the route asks for the intent it opened last time, and reuses it when
-- Stripe still says it is usable.
create or replace function public.checkout_payment_state(p_reservation_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, pg_temp
as $fn$
  select coalesce(
    (select jsonb_build_object(
              'found', true,
              'stripe_payment_intent_id', p.stripe_payment_intent_id,
              'stripe_customer_id', p.stripe_customer_id,
              'deposit_status', p.deposit_status,
              'deposit_amount', p.deposit_amount,
              'save_card_consent', p.save_card_consent)
       from public.reservation_payments p
      where p.reservation_id = p_reservation_id),
    jsonb_build_object('found', false));
$fn$;

revoke all on function public.checkout_payment_state(uuid) from public, anon, authenticated;
grant execute on function public.checkout_payment_state(uuid) to service_role;
