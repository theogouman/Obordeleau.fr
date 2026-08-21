import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { routing, type Locale } from '@/i18n/routing';
import { balanceByLinkToken, recordBalanceSession } from '@/lib/balances';
import { property } from '@/lib/content';
import { localizedUrl } from '@/lib/seo';
import { paymentsConfigured, stripe, toMinorUnits } from '@/lib/stripe';
import { bookingStoreConfigured } from '@/lib/supabase';

/**
 * The fallback link, minted fresh on every click.
 *
 * The email points here rather than at Stripe because a Checkout session dies
 * within the day, and a guest who opens the message the following evening must
 * not find a dead link. The token is ours and does not expire; the session is
 * created at the moment it is needed and the guest is sent straight to it.
 *
 * The amount comes from the frozen balance in the database. Nothing about it is
 * in the URL, so there is nothing in the URL to tamper with.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Outcome = 'paid' | 'cancelled' | 'unavailable';

function asLocale(value: string | null): Locale {
  return (routing.locales as readonly string[]).includes(value ?? '')
    ? (value as Locale)
    : routing.defaultLocale;
}

function balancePage(locale: Locale, status: Outcome): string {
  return `${localizedUrl('/balance', locale)}?status=${status}`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!bookingStoreConfigured || !paymentsConfigured) {
    return NextResponse.redirect(balancePage(routing.defaultLocale, 'unavailable'), 303);
  }

  let found;

  try {
    found = await balanceByLinkToken(token);
  } catch (error) {
    console.error('[balance] could not resolve the pay link', error);
    return NextResponse.redirect(balancePage(routing.defaultLocale, 'unavailable'), 303);
  }

  // A token that is not ours, or one that was cleared because the balance has
  // since been settled. Either way there is nothing to pay here.
  if (!found.found) {
    return NextResponse.redirect(balancePage(routing.defaultLocale, 'unavailable'), 303);
  }

  const locale = asLocale(found.locale);

  if (found.balanceStatus === 'paid') {
    return NextResponse.redirect(balancePage(locale, 'paid'), 303);
  }

  if (found.reservationStatus !== 'confirmed' || found.balanceDue <= 0) {
    return NextResponse.redirect(balancePage(locale, 'unavailable'), 303);
  }

  try {
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      // One or the other, never both: Stripe refuses a session that names a
      // customer and an address to invent one from.
      ...(found.customerId
        ? { customer: found.customerId }
        : { customer_email: found.guestEmail }),
      locale: locale as Stripe.Checkout.SessionCreateParams.Locale,
      // Cards only, as everywhere else on this path. It keeps the settlement
      // synchronous: a method that clears days later would mean a session
      // marked complete with nothing behind it yet.
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: found.currency.toLowerCase(),
            unit_amount: toMinorUnits(found.balanceDue),
            product_data: {
              name: `${property.name}, ${found.startDate} ${found.endDate}`,
            },
          },
        },
      ],
      success_url: balancePage(locale, 'paid'),
      cancel_url: balancePage(locale, 'cancelled'),
      metadata: { kind: 'balance', reservation_id: found.reservationId },
      // Repeated on the intent, because the webhook that matters may be the
      // one about the payment rather than the one about the session.
      payment_intent_data: {
        metadata: { kind: 'balance', reservation_id: found.reservationId },
      },
    });

    if (!session.url) {
      throw new Error('the checkout session came back without a url');
    }

    await recordBalanceSession(found.reservationId, session.id);

    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error('[balance] could not open the checkout session', error);
    return NextResponse.redirect(balancePage(locale, 'unavailable'), 303);
  }
}
