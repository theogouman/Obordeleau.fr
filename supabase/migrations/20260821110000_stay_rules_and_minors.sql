-- Phase 3, lot 3: what the visitor's picker needs, and one adult per booking.
--
-- Two things the booking flow was missing.
--
-- First, the picker has to guide before it can be told no. It needs the stay
-- constraints themselves, not a rate: which days a season will take as an
-- arrival, how long a stay has to be, whether the length must be a multiple.
-- `public_stay_rules` hands over exactly that and nothing about money.
--
-- Second, the tourist tax is charged per adult, so the number of minors is part
-- of the stay and has to be stored with it. Without the column a booking taken
-- between now and the payment lot would lose the one figure needed to work out
-- what it owes.

-- The constraints, with no prices in them. Past seasons are dropped: they
-- cannot constrain a stay that has to start tomorrow at the earliest.
create or replace function public.public_stay_rules()
returns jsonb
language sql
stable
set search_path = pg_catalog, pg_temp
as $fn$
  select jsonb_build_object(
    'today', public.booking_today(),
    'min_arrival', public.booking_today() + 1,
    'default_min_nights',
      coalesce((select c.default_min_nights from public.pricing_config c where c.singleton), 2),
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'label', t.label,
               'start_date', t.start_date,
               'end_date', t.end_date,
               'min_nights', t.min_nights,
               'checkin_constraint', t.checkin_constraint,
               'stay_multiple', t.stay_multiple
             ) order by t.start_date)
        from public.seasonal_tiers t
       where t.end_date > public.booking_today()), '[]'::jsonb)
  );
$fn$;

-- Minors ride along with the party size. Strictly fewer than the party, because
-- a stay with no adult in it cannot be quoted (get_quote refuses on adults < 1)
-- and cannot be let either.
alter table public.reservations
  add column if not exists minors int not null default 0;

alter table public.reservations
  drop constraint if exists reservations_minors_within_party;

alter table public.reservations
  add constraint reservations_minors_within_party
  check (minors >= 0 and (party_size is null or minors < party_size));

comment on column public.reservations.minors is
  'Guests under 18, exempt from the tourist tax. adults = party_size - minors.';

-- The write path re-applies the stay rule rather than keeping its own copy.
--
-- It used to check "at least one night" and "not before tomorrow" itself, which
-- was the whole rule when it was written and is now a fragment of it: since lot
-- 1 a stay also has to satisfy the minimum, the arrival day and the length
-- multiple of every season it touches. Two nights in February and a Tuesday
-- arrival in July would both have been written. validate_stay is the authority
-- on all of it, so the duplicate is gone and the reasons come back from there.
--
-- Dropped rather than replaced: a new argument makes a second function, and
-- PostgREST would then see two overloads of the same name.
drop function if exists public.create_direct_reservation(text, text, date, date, int, text, text);

create or replace function public.create_direct_reservation(
  p_guest_name text,
  p_guest_email text,
  p_start date,
  p_end date,
  p_party_size int default null,
  p_notes text default null,
  p_locale text default null,
  p_minors int default 0
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_check jsonb;
  v_id uuid;
  v_created timestamptz;
begin
  v_check := public.validate_stay(p_start, p_end);

  if not coalesce((v_check ->> 'valid')::boolean, false) then
    -- {valid: false, reason: 'min_nights', min_nights: 2} becomes
    -- {ok: false, reason: 'min_nights', min_nights: 2}, so a caller keeps
    -- whatever detail it needs to phrase the refusal.
    return jsonb_build_object('ok', false) || (v_check - 'valid');
  end if;

  if p_minors is not null and p_minors < 0 then
    return jsonb_build_object('ok', false, 'reason', 'minors');
  end if;
  if p_minors is not null and p_party_size is not null and p_minors >= p_party_size then
    return jsonb_build_object('ok', false, 'reason', 'minors');
  end if;

  begin
    insert into public.reservations
      (source, guest_name, guest_email, party_size, minors, start_date, end_date, notes, locale)
    values
      ('direct', p_guest_name, p_guest_email, p_party_size, coalesce(p_minors, 0),
       p_start, p_end, p_notes, p_locale)
    returning id, created_at into v_id, v_created;
  exception when exclusion_violation then
    -- Another submission committed these nights between the check and the insert.
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'start_date', p_start,
    'end_date', p_end,
    'created_at', v_created
  );
end;
$fn$;

revoke all on function public.public_stay_rules() from public, anon, authenticated;
revoke all on function public.create_direct_reservation(text, text, date, date, int, text, text, int)
  from public, anon, authenticated;

grant execute on function public.public_stay_rules() to service_role;
grant execute on function public.create_direct_reservation(text, text, date, date, int, text, text, int)
  to service_role;
