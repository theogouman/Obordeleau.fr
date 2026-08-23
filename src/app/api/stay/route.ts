import { NextResponse, type NextRequest } from 'next/server';
import { isIsoDate } from '@/lib/dates';
import { validateStay } from '@/lib/pricing';
import { LIMITS, clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { bookingStoreConfigured } from '@/lib/supabase';

/**
 * Is this stay allowed?
 *
 * The picker greys out what it believes the rule refuses, from the mirror in
 * src/lib/stay.ts. This is the confirmation, and it is the answer that counts:
 * the same validate_stay the write path re-applies, so a range the browser was
 * talked into cannot get past the button.
 *
 * A refusal is a normal answer, not an error, so it is a 200 with valid: false.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

export async function POST(request: NextRequest) {
  const throttle = await rateLimit('stay', clientIp(request), LIMITS.stay);
  if (throttle.limited) return tooManyRequests(throttle.retryAfterSeconds);

  let payload: { from?: string; to?: string };

  try {
    payload = (await request.json()) as { from?: string; to?: string };
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400, ...NO_STORE });
  }

  const from = typeof payload.from === 'string' ? payload.from : '';
  const to = typeof payload.to === 'string' ? payload.to : '';

  if (!isIsoDate(from) || !isIsoDate(to) || to <= from) {
    return NextResponse.json({ error: 'invalid_range' }, { status: 400, ...NO_STORE });
  }

  if (!bookingStoreConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503, ...NO_STORE });
  }

  try {
    const stay = await validateStay(from, to);

    return NextResponse.json(
      {
        valid: stay.valid,
        reason: stay.reason,
        minNights: stay.valid ? undefined : stay.minNights,
        minArrival: stay.valid ? undefined : stay.minArrival,
        requiredCheckinDay: stay.valid ? undefined : stay.requiredCheckinDay,
        stayMultiple: stay.valid ? undefined : stay.stayMultiple,
      },
      NO_STORE,
    );
  } catch (error) {
    console.error('[stay] store unreachable', error);
    return NextResponse.json({ error: 'unavailable' }, { status: 502, ...NO_STORE });
  }
}
