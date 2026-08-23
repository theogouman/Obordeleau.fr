import { NextResponse, type NextRequest } from 'next/server';
import { property } from '@/lib/content';
import { isIsoDate } from '@/lib/dates';
import { getQuote, isPricingNotConfigured, validateStay } from '@/lib/pricing';
import { LIMITS, clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { bookingStoreConfigured } from '@/lib/supabase';

/**
 * The quote the visitor is shown.
 *
 * Read only, and it is the only way a price reaches the browser. Nothing is
 * added up here: the figures come from get_quote in the database, which is also
 * where the amount charged will come from, so the two cannot drift apart. The
 * request carries dates and people, never money.
 *
 * The stay is validated before it is priced, so a range the picker should have
 * refused comes back as a refusal rather than as a total for a stay that cannot
 * be booked. An invalid stay is a normal answer, not an error, so it is a 200
 * with `valid: false`.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type QuotePayload = {
  from?: string;
  to?: string;
  guests?: number;
  minors?: number;
};

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

function whole(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

export async function POST(request: NextRequest) {
  const throttle = await rateLimit('quote', clientIp(request), LIMITS.quote);
  if (throttle.limited) return tooManyRequests(throttle.retryAfterSeconds);

  let payload: QuotePayload;

  try {
    payload = (await request.json()) as QuotePayload;
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400, ...NO_STORE });
  }

  const from = typeof payload.from === 'string' ? payload.from : '';
  const to = typeof payload.to === 'string' ? payload.to : '';

  if (!isIsoDate(from) || !isIsoDate(to) || to <= from) {
    return NextResponse.json({ error: 'invalid_range' }, { status: 400, ...NO_STORE });
  }

  const maxGuests = property.capacity.maxGuests;
  const guests = whole(payload.guests, 1, maxGuests);
  const minors = whole(payload.minors ?? 0, 0, maxGuests);

  if (guests === null || minors === null || minors >= guests) {
    // At least one adult: a party of minors cannot sign for a stay, and
    // get_quote refuses to price one.
    return NextResponse.json({ error: 'invalid_party' }, { status: 400, ...NO_STORE });
  }

  if (!bookingStoreConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503, ...NO_STORE });
  }

  try {
    const stay = await validateStay(from, to);

    if (!stay.valid) {
      return NextResponse.json(
        {
          valid: false,
          reason: stay.reason,
          minNights: stay.minNights,
          minArrival: stay.minArrival,
          requiredCheckinDay: stay.requiredCheckinDay,
          stayMultiple: stay.stayMultiple,
        },
        NO_STORE,
      );
    }

    const quote = await getQuote(from, to, guests - minors, minors);

    return NextResponse.json({ valid: true, quote }, NO_STORE);
  } catch (error) {
    if (isPricingNotConfigured(error)) {
      // The owner has not set a rate for one of these nights. Nothing is sold
      // at a guessed price, so the flow falls back to the enquiry it had before.
      return NextResponse.json({ error: 'not_priced' }, { status: 503, ...NO_STORE });
    }

    console.error('[quote] store unreachable', error);
    return NextResponse.json({ error: 'unavailable' }, { status: 502, ...NO_STORE });
  }
}
