import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { routing, type Locale } from '@/i18n/routing';
import { reserve } from '@/lib/availability';
import { property } from '@/lib/content';
import { isIsoDate } from '@/lib/dates';
import {
  HOLD_MINUTES,
  checkoutPaymentState,
  findActiveHold,
  recordDepositIntent,
  releaseHold,
} from '@/lib/payments';
import { getQuote, isPricingNotConfigured, validateStay, type Quote } from '@/lib/pricing';
import { LIMITS, MAX_ACTIVE_HOLDS, clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';
import {
  isReusableIntentStatus,
  paymentsConfigured,
  stripe,
  stripePublishableKey,
  toMinorUnits,
} from '@/lib/stripe';
import { bookingStoreConfigured } from '@/lib/supabase';

/**
 * Opening a checkout: the nights are taken, then a payment is opened on them.
 *
 * The order matters and is the whole point of this route.
 *
 *   1. the stay is revalidated by validate_stay, the same function the write
 *      path re-applies, because the picker is a mirror and not an authority
 *   2. the party is checked against the capacity of the studio
 *   3. the amount is recomputed by get_quote, server side. The browser sends
 *      dates and people; it never sends a price, and one sent up would be
 *      ignored
 *   4. the nights are held, under the exclusion constraint, before Stripe is
 *      called at all. Two visitors reaching this route for the same week: the
 *      second is refused here, with no card touched and nothing to refund
 *   5. only then is a payment intent opened for what is due today, which is
 *      the deposit on a distant, dear stay and the whole total on any other
 *
 * Coming back to an abandoned checkout reuses both the hold and the intent. A
 * second intent left open on the same nights could succeed later and be money
 * with no booking to attach it to.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

type CheckoutPayload = {
  from?: string;
  to?: string;
  guests?: number;
  minors?: number;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  locale?: string;
  /** The opt in. Without it the card is not kept and nothing is charged later. */
  saveCard?: boolean;
  company?: string;
  elapsedMs?: number;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_FIELD = 2000;
const MIN_FILL_MS = 2500;

function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD);
}

function asLocale(value: unknown): Locale {
  const candidate = String(value);
  return (routing.locales as readonly string[]).includes(candidate)
    ? (candidate as Locale)
    : routing.defaultLocale;
}

/** The short code the guest quotes back, the same one the enquiry flow gives. */
function reference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/**
 * One Stripe customer per email address, so the saved card and the balance
 * charge in lot 5 hang off something stable rather than off one booking.
 */
async function customerFor(email: string, name: string): Promise<string> {
  const existing = await stripe().customers.list({ email, limit: 1 });
  if (existing.data.length > 0) return existing.data[0].id;

  const created = await stripe().customers.create({ email, name: name || undefined });
  return created.id;
}

export async function POST(request: NextRequest) {
  let payload: CheckoutPayload;

  try {
    payload = (await request.json()) as CheckoutPayload;
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400, ...NO_STORE });
  }

  // Honeypot and too-fast submissions. Answer 200 so a bot learns nothing, and
  // above all write nothing and open no payment.
  if (clean(payload.company) !== '') {
    return NextResponse.json({ ok: true, ignored: true }, NO_STORE);
  }
  if (typeof payload.elapsedMs === 'number' && payload.elapsedMs < MIN_FILL_MS) {
    return NextResponse.json({ ok: true, ignored: true }, NO_STORE);
  }

  // Shared across every instance and keyed on the address the platform saw, so
  // it cannot be reset by landing on a fresh instance or by forging a header.
  const ip = clientIp(request);
  const throttle = await rateLimit('checkout', ip, LIMITS.checkout);

  if (throttle.limited) {
    return tooManyRequests(throttle.retryAfterSeconds);
  }

  const name = clean(payload.name);
  const email = clean(payload.email);
  const phone = clean(payload.phone);
  const message = clean(payload.message);
  const from = clean(payload.from);
  const to = clean(payload.to);
  const guests = Number(payload.guests);
  const minors = Number.isFinite(Number(payload.minors)) ? Number(payload.minors) : 0;
  const locale = asLocale(payload.locale);
  const saveCard = payload.saveCard === true;

  const problems: string[] = [];
  if (!name) problems.push('name');
  if (!email || !EMAIL_PATTERN.test(email)) problems.push('email');
  if (!isIsoDate(from) || !isIsoDate(to) || to <= from) problems.push('dates');

  // The capacity guard, in front of the quote and in front of the hold. It
  // mirrors the enquiry route and the form, and the database now refuses a
  // party over four as well, whichever path tries to write it.
  if (!Number.isInteger(guests) || guests < 1 || guests > property.capacity.maxGuests) {
    problems.push('guests');
  }
  // At least one adult: a party of minors cannot sign for a stay, and get_quote
  // refuses to price one.
  if (!Number.isInteger(minors) || minors < 0 || (Number.isFinite(guests) && minors >= guests)) {
    problems.push('minors');
  }

  if (problems.length > 0) {
    return NextResponse.json({ error: 'invalid', fields: problems }, { status: 400, ...NO_STORE });
  }

  if (!bookingStoreConfigured) {
    console.error('[checkout] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing');
    return NextResponse.json({ error: 'not_configured' }, { status: 503, ...NO_STORE });
  }

  if (!paymentsConfigured) {
    // No card can be taken, so none is asked for. The flow falls back to the
    // enquiry it had before this lot.
    return NextResponse.json({ error: 'payments_unavailable' }, { status: 503, ...NO_STORE });
  }

  // Empty until a hold exists, which is what the branches below key on.
  let reservationId = '';
  let holdExpiresAt: string | null = null;
  let heldHere = false;

  try {
    // The hold this visitor may already have from an earlier attempt. Looked up
    // before the stay is validated, because their own hold would otherwise make
    // the nights read as unavailable to them.
    const existing = await findActiveHold(email, from, to, HOLD_MINUTES);

    if (existing.found) {
      reservationId = existing.id;
      holdExpiresAt = existing.holdExpiresAt;
    } else {
      const stay = await validateStay(from, to);

      if (!stay.valid) {
        return NextResponse.json(
          {
            error: stay.reason,
            minNights: stay.minNights,
            minArrival: stay.minArrival,
            requiredCheckinDay: stay.requiredCheckinDay,
            stayMultiple: stay.stayMultiple,
          },
          { status: stay.reason === 'unavailable' ? 409 : 400, ...NO_STORE },
        );
      }
    }

    // The amount, from the one function that computes one. Done before the hold
    // so an unpriceable stay never takes inventory.
    let quote: Quote;

    try {
      quote = await getQuote(from, to, guests - minors, minors);
    } catch (error) {
      if (isPricingNotConfigured(error)) {
        return NextResponse.json({ error: 'not_priced' }, { status: 503, ...NO_STORE });
      }
      throw error;
    }

    if (reservationId === '') {
      const outcome = await reserve({
        guestName: name,
        guestEmail: email,
        startDate: from,
        endDate: to,
        partySize: guests,
        minors,
        notes:
          [phone ? `Tel: ${phone}` : null, message || null].filter(Boolean).join(' | ') || null,
        locale,
        holdMinutes: HOLD_MINUTES,
        // The address and the cap that stops one actor freezing the calendar
        // with holds they never pay for. Enforced in the write path under a
        // per-address lock, so the count is exact even under a burst.
        holdIp: ip,
        maxActiveHolds: MAX_ACTIVE_HOLDS,
      });

      if (!outcome.ok) {
        // Too many live holds is an abuse signal, not a fault in the stay. It is
        // answered like the rate limit above so the visitor is asked to wait
        // rather than told the nights are gone.
        if (outcome.reason === 'too_many_holds') {
          return tooManyRequests(LIMITS.checkout.windowSeconds);
        }

        return NextResponse.json(
          {
            error: outcome.reason,
            minNights: outcome.minNights,
            minArrival: outcome.minArrival,
            requiredCheckinDay: outcome.requiredCheckinDay,
            stayMultiple: outcome.stayMultiple,
          },
          { status: outcome.reason === 'unavailable' ? 409 : 400, ...NO_STORE },
        );
      }

      reservationId = outcome.id;
      holdExpiresAt = outcome.holdExpiresAt;
      heldHere = true;
    }

    const state = await checkoutPaymentState(reservationId);

    if (state.found && state.depositStatus === 'paid') {
      // The deposit went through on an earlier attempt and the booking is
      // already confirmed. Nothing more to charge.
      return NextResponse.json(
        { alreadyPaid: true, reference: reference(reservationId), from, to },
        NO_STORE,
      );
    }

    const amount = toMinorUnits(quote.depositAmount);

    /*
     * A card is kept only when there is something left to charge it for.
     *
     * A stay taken in full has no balance and no charge date, so keeping the
     * card would be asking a guest to leave one for a payment that is never
     * going to happen. The form does not offer the opt in in that case; this is
     * the server refusing to act on it whatever a browser sends up.
     */
    const keepCard = saveCard && quote.balanceAmount > 0;
    // Null and not undefined: it is compared with what Stripe reports back,
    // which is null when no card is being kept.
    const futureUsage: 'off_session' | null = keepCard ? 'off_session' : null;

    let intent: Stripe.PaymentIntent | null = null;

    if (state.found && state.paymentIntentId) {
      try {
        const open = await stripe().paymentIntents.retrieve(state.paymentIntentId);

        if (isReusableIntentStatus(open.status)) {
          if (open.amount === amount && open.setup_future_usage === futureUsage) {
            intent = open;
          } else {
            // The amount or the consent moved. Cancelling and opening a fresh
            // one is clearer than trying to unset a field on a live intent, and
            // it leaves nothing behind that could be paid later.
            await stripe().paymentIntents.cancel(open.id);
          }
        }
      } catch (error) {
        console.warn('[checkout] could not reuse the open payment intent', error);
      }
    }

    if (!intent) {
      const customerId = await customerFor(email, name);

      const params: Stripe.PaymentIntentCreateParams = {
        amount,
        currency: quote.currency.toLowerCase(),
        customer: customerId,
        /*
         * Stripe decides what to show, which is how the wallets get in: a card,
         * Apple Pay on an Apple device, Google Pay on Chrome. Redirects stay
         * shut off, so every method offered here confirms on the page and none
         * of them needs somewhere to come back to.
         *
         * On a stay that keeps a card the setup_future_usage below narrows the
         * list again, down to what can still be charged off session months
         * later. That is the balance staying collectable, and it is why this
         * cannot be a plain list of methods.
         */
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        description: `${property.name} ${from} ${to}`,
        receipt_email: email,
        metadata: {
          kind: 'deposit',
          reservation_id: reservationId,
          check_in: from,
          check_out: to,
          guests: String(guests),
          minors: String(minors),
          locale,
        },
      };

      // The card is kept only when the guest agreed to it and a balance is
      // actually coming. Without this the payment method cannot be used again,
      // which is exactly what no consent has to mean.
      if (keepCard) params.setup_future_usage = 'off_session';

      intent = await stripe().paymentIntents.create(params, {
        // Keyed on the hold and the amount, so a double click opens one payment.
        idempotencyKey: `deposit-${reservationId}-${amount}-${keepCard ? 'save' : 'once'}`,
      });
    }

    await recordDepositIntent({
      reservationId,
      paymentIntentId: intent.id,
      customerId: typeof intent.customer === 'string' ? intent.customer : null,
      depositAmount: quote.depositAmount,
      balanceDue: quote.balanceAmount,
      balanceChargeOn: quote.balanceChargeOn,
      saveCardConsent: keepCard,
      adults: guests - minors,
      minors,
      quote,
    });

    if (!intent.client_secret) {
      throw new Error('the payment intent came back without a client secret');
    }

    return NextResponse.json(
      {
        ok: true,
        clientSecret: intent.client_secret,
        publishableKey: stripePublishableKey,
        reservationId,
        reference: reference(reservationId),
        holdExpiresAt,
        quote,
      },
      NO_STORE,
    );
  } catch (error) {
    // Stripe refused to open a payment, or the store went away. The nights are
    // handed straight back rather than left blocked for the hold's lifetime,
    // but only if this request is what took them.
    if (heldHere && reservationId !== '') {
      await releaseHold(reservationId).catch(() => undefined);
    }

    console.error('[checkout] could not open the payment', error);
    return NextResponse.json({ error: 'unavailable' }, { status: 502, ...NO_STORE });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
