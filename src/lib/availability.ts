import { addDays, todayInParis } from '@/lib/dates';
import { callDatabase } from '@/lib/supabase';

/**
 * The availability rule, phrased once.
 *
 * A range [start, end) is bookable when it runs forwards, covers at least
 * MIN_NIGHTS nights, starts no earlier than tomorrow in Europe/Paris, and
 * overlaps no confirmed reservation, no manual block and no imported block.
 *
 * The authority on all of that is the database: `create_direct_reservation`
 * re-applies the whole rule inside the write, and the exclusion constraint on
 * `reservations` settles a race. What follows is the read side, used to grey
 * dates out and to give an early, kinder answer than a rejected submission.
 */

/** Safe defaults until the admin interface can configure them. */
export const MIN_NIGHTS = 1;

/** No same day booking: the earliest arrival is tomorrow at the property. */
export function firstBookableDate(): string {
  return addDays(todayInParis(), 1);
}

export const DEFAULT_WINDOW_DAYS = 365;
export const MAX_WINDOW_DAYS = 400;

/**
 * A `hold` is a checkout in progress: the nights are taken while a card is
 * being authorised, and they block exactly as a booking does. It is a kind of
 * its own because the console says who is holding a night, and "reserved" and
 * "somebody is paying for it right now" do not mean the same thing.
 */
export type BusyKind = 'reservation' | 'hold' | 'manual' | 'external';

export type BusyRange = {
  kind: BusyKind;
  ref: string;
  startDate: string;
  /** Exclusive: the nights run up to, but not including, this date. */
  endDate: string;
  platform: string | null;
};

type BusyRow = {
  b_kind: string;
  b_ref: string;
  b_start: string;
  b_end: string;
  b_platform: string | null;
};

/**
 * Everything busy that overlaps [from, to). A null `to` means "with no end",
 * which is what the master feed wants.
 */
export async function busyRanges(from: string, to: string | null): Promise<BusyRange[]> {
  const rows = await callDatabase<BusyRow[]>('busy_ranges', { p_from: from, p_to: to });

  return rows.map((row) => ({
    kind: row.b_kind as BusyKind,
    ref: row.b_ref,
    startDate: row.b_start,
    endDate: row.b_end,
    platform: row.b_platform,
  }));
}

/**
 * The individual nights taken inside [from, to), sorted and deduplicated.
 *
 * A night is named by the date it starts on, so a range ending on the 15th
 * leaves the 15th free: that date can be the next arrival.
 */
export function blockedNights(ranges: BusyRange[], from: string, to: string): string[] {
  const nights = new Set<string>();

  for (const range of ranges) {
    let cursor = range.startDate < from ? from : range.startDate;

    // Bounded by the window, so a malformed row cannot spin here.
    while (cursor < range.endDate && cursor < to) {
      nights.add(cursor);
      cursor = addDays(cursor, 1);
    }
  }

  return [...nights].sort();
}

export type ReservationRequest = {
  guestName: string;
  guestEmail: string;
  startDate: string;
  endDate: string;
  partySize: number | null;
  /** Guests under 18, exempt from the tourist tax. Always fewer than the party. */
  minors: number;
  notes: string | null;
  locale: string | null;
  /**
   * Minutes to hold the nights for. Required, and required on purpose.
   *
   * The database function still accepts no lifetime and still writes a
   * confirmed booking when given none, because the hold was added to it
   * without touching its callers. There is no longer a caller that wants
   * that: a stay is confirmed by its deposit, so the only write the site makes
   * is a hold, and the settlement of a paid deposit is what confirms it. Making
   * this required means a future caller has to ask for a free confirmation out
   * loud rather than get one by leaving an argument out.
   */
  holdMinutes: number;
};

export type ReservationOutcome =
  | {
      ok: true;
      id: string;
      startDate: string;
      endDate: string;
      status: 'confirmed' | 'hold';
      holdExpiresAt: string | null;
    }
  | {
      ok: false;
      /**
       * The vocabulary validate_stay answers in. The write path re-applies the
       * whole stay rule now, so a Tuesday arrival in July and a length that is
       * not a whole number of weeks each come back named rather than as a
       * blanket "unavailable".
       */
      reason:
        | 'unavailable'
        | 'too_soon'
        | 'min_nights'
        | 'invalid_range'
        | 'checkin_day'
        | 'stay_multiple'
        | 'minors'
        | 'invalid_hold';
      minArrival?: string;
      minNights?: number;
      requiredCheckinDay?: string;
      stayMultiple?: number;
    };

/**
 * The one write path, and it writes a hold.
 *
 * Lot 4 gave the database function a hold lifetime and changed nothing else,
 * so the enquiry route that confirmed outright did not have to be touched.
 * That route is gone: a stay confirmed without its deposit is a night given
 * away, and there is nothing left that wants one.
 */
export async function reserve(request: ReservationRequest): Promise<ReservationOutcome> {
  const result = await callDatabase<{
    ok: boolean;
    reason?: string;
    id?: string;
    start_date?: string;
    end_date?: string;
    status?: string;
    hold_expires_at?: string | null;
    min_arrival?: string;
    min_nights?: number;
    required_checkin_day?: string;
    stay_multiple?: number;
  }>('create_direct_reservation', {
    p_guest_name: request.guestName,
    p_guest_email: request.guestEmail,
    p_start: request.startDate,
    p_end: request.endDate,
    p_party_size: request.partySize,
    p_notes: request.notes,
    p_locale: request.locale,
    p_minors: request.minors,
    p_hold_minutes: request.holdMinutes,
  });

  if (result.ok && result.id) {
    return {
      ok: true,
      id: result.id,
      startDate: result.start_date ?? request.startDate,
      endDate: result.end_date ?? request.endDate,
      status: result.status === 'hold' ? 'hold' : 'confirmed',
      holdExpiresAt: result.hold_expires_at ?? null,
    };
  }

  const named = [
    'too_soon',
    'min_nights',
    'invalid_range',
    'checkin_day',
    'stay_multiple',
    'minors',
    'invalid_hold',
  ] as const;

  const reason = result.reason ?? 'unavailable';

  return {
    ok: false,
    reason: (named as readonly string[]).includes(reason)
      ? (reason as (typeof named)[number])
      : 'unavailable',
    minArrival: result.min_arrival,
    minNights: result.min_nights,
    requiredCheckinDay: result.required_checkin_day,
    stayMultiple: result.stay_multiple,
  };
}
