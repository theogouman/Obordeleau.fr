-- Today in Europe/Paris. The whole availability rule is anchored on the
-- property's own timezone, never on the visitor's or the server's.
create or replace function public.booking_today()
returns date
language sql
stable
set search_path = pg_catalog, pg_temp
as $$ select (now() at time zone 'Europe/Paris')::date $$;

-- Everything that is busy in a window, from the three sources at once.
-- Output names are prefixed so they cannot collide with the column names below.
create or replace function public.busy_ranges(p_from date, p_to date default null)
returns table (b_kind text, b_ref uuid, b_start date, b_end date, b_platform text)
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select 'reservation'::text, r.id, r.start_date, r.end_date, null::text
    from public.reservations r
   where r.status = 'confirmed'
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
$$;

-- The one write path. It re-applies the availability rule and inserts inside the
-- same statement, so the exclusion constraint is the last word on a race.
-- Phase 3 adds a status and a payment reference here without touching callers.
create or replace function public.create_direct_reservation(
  p_guest_name text,
  p_guest_email text,
  p_start date,
  p_end date,
  p_party_size int default null,
  p_notes text default null,
  p_locale text default null
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_min_arrival date := public.booking_today() + 1;
  v_range daterange;
  v_id uuid;
  v_created timestamptz;
begin
  if p_start is null or p_end is null or p_end <= p_start then
    return jsonb_build_object('ok', false, 'reason', 'invalid_range');
  end if;

  -- Minimum stay. One night today, configurable from the admin later.
  if (p_end - p_start) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'min_nights', 'min_nights', 1);
  end if;

  -- No same day booking: the earliest arrival is tomorrow in Europe/Paris.
  if p_start < v_min_arrival then
    return jsonb_build_object('ok', false, 'reason', 'too_soon', 'min_arrival', v_min_arrival);
  end if;

  v_range := daterange(p_start, p_end, '[)');

  if exists (
        select 1 from public.external_blocks e
         where daterange(e.start_date, e.end_date, '[)') && v_range)
     or exists (
        select 1 from public.manual_blocks m
         where daterange(m.start_date, m.end_date, '[)') && v_range)
     or exists (
        select 1 from public.reservations r
         where r.status = 'confirmed'
           and daterange(r.start_date, r.end_date, '[)') && v_range)
  then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  begin
    insert into public.reservations
      (source, guest_name, guest_email, party_size, start_date, end_date, notes, locale)
    values
      ('direct', p_guest_name, p_guest_email, p_party_size, p_start, p_end, p_notes, p_locale)
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
$$;

-- PostgREST publishes public functions. Only the service role may call these.
revoke all on function public.booking_today() from public, anon, authenticated;
revoke all on function public.busy_ranges(date, date) from public, anon, authenticated;
revoke all on function public.create_direct_reservation(text, text, date, date, int, text, text)
  from public, anon, authenticated;

grant execute on function public.booking_today() to service_role;
grant execute on function public.busy_ranges(date, date) to service_role;
grant execute on function public.create_direct_reservation(text, text, date, date, int, text, text)
  to service_role;
