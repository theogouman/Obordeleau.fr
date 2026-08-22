-- Phase 3: l'acompte déjà réglé voyage avec le solde à réclamer.
--
-- Le mail de solde affiche deux lignes, ce qui a déjà été payé et ce qui
-- reste à payer, or la ligne réclamée ne portait que la seconde. Le montant
-- de l'acompte est sur reservation_payments depuis le lot 4, il suffit de le
-- joindre au jsonb.
--
-- La fonction est recopiée telle qu'elle sort de 20260822090000, exclusion du
-- statut 'none' comprise : un séjour réglé en entier ne doit jamais être
-- réclamé, et cette garde ne se redécouvre pas toute seule si on repart d'une
-- version plus ancienne. Rien d'autre ne change.

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
           'deposit_amount', c.deposit_amount,
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
