import { NextResponse, type NextRequest } from 'next/server';
import { bookingReference } from '@/lib/booking-emails';
import { settleSucceededDeposit } from '@/lib/deposit-settlement';
import { paymentsConfigured, stripe } from '@/lib/stripe';
import { bookingStoreConfigured } from '@/lib/supabase';

/**
 * The browser saying the card went through.
 *
 * It is not taken at its word. The intent is read back from Stripe and only a
 * status Stripe itself reports as succeeded confirms anything, so the worst a
 * forged call can do is ask about a payment that already exists.
 *
 * The webhook is still what guarantees the booking: this route only makes the
 * confirmation appear while the visitor is still looking at the screen. Whoever
 * gets there first converts the hold; the other is told it was already done and
 * sends no second email.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

const INTENT_PATTERN = /^pi_[A-Za-z0-9_]{4,250}$/;

export async function POST(request: NextRequest) {
  let payload: { paymentIntentId?: string };

  try {
    payload = (await request.json()) as { paymentIntentId?: string };
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400, ...NO_STORE });
  }

  const intentId = typeof payload.paymentIntentId === 'string' ? payload.paymentIntentId : '';

  if (!INTENT_PATTERN.test(intentId)) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400, ...NO_STORE });
  }

  if (!bookingStoreConfigured || !paymentsConfigured) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503, ...NO_STORE });
  }

  try {
    const intent = await stripe().paymentIntents.retrieve(intentId);

    if (intent.status !== 'succeeded') {
      return NextResponse.json({ ok: false, status: intent.status }, NO_STORE);
    }

    const settlement = await settleSucceededDeposit(intent);

    if (settlement.status === 'unknown') {
      return NextResponse.json({ error: 'unknown_payment' }, { status: 404, ...NO_STORE });
    }

    if (settlement.status === 'refunded') {
      return NextResponse.json({ ok: false, status: 'refunded' }, { status: 409, ...NO_STORE });
    }

    // Deliberately narrow. Anyone holding an intent id learns only that it is
    // paid and for which nights, never who booked them.
    return NextResponse.json(
      {
        ok: true,
        reference: bookingReference(settlement.booking.reservationId),
        from: settlement.booking.startDate,
        to: settlement.booking.endDate,
      },
      NO_STORE,
    );
  } catch (error) {
    console.error('[checkout/confirm] could not settle the payment', error);
    return NextResponse.json({ error: 'unavailable' }, { status: 502, ...NO_STORE });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
