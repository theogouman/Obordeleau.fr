-- Phase 3, lot 4: the quote says when the balance is taken.
--
-- The date belongs in the quote rather than beside it. It is part of what the
-- guest agrees to when they tick the box that lets the card be charged again,
-- it has to appear in the confirmation email, and lot 5 reads it off the frozen
-- quote. Working it out anywhere else would be a second copy of a rule that
-- already lives in pricing_config.
--
-- Purely additive: every field lot 3 reads is still there, in the same shape.
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
  v_subtotal numeric(12,2);
  v_tax numeric(12,2);
  v_total numeric(12,2);
  v_deposit numeric(12,2);
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
         c.deposit_charge_days_before_arrival
    into v_cleaning, v_tax_rate, v_deposit_pct, v_charge_days
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
  -- The deposit bites on the accommodation alone. Cleaning and tax ride in the
  -- balance, which is what lot 5 charges before arrival.
  v_deposit := round(v_subtotal * v_deposit_pct / 100, 2);

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
    'deposit_percentage', v_deposit_pct,
    'deposit_amount', v_deposit,
    'balance_amount', round(v_total - v_deposit, 2),
    'balance_charge_days_before_arrival', v_charge_days,
    -- Null while the owner has not said how many days before arrival. The
    -- checkout then takes the deposit and leaves the balance to be arranged,
    -- rather than inventing a date to charge a card on.
    'balance_charge_on',
      case when v_charge_days is null then null else p_check_in - v_charge_days end,
    'currency', 'EUR'
  );
end;
$fn$;
