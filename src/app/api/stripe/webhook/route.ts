import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { settleSucceededDeposit } from '@/lib/deposit-settlement';
import { markDepositFailed } from '@/lib/payments';
import { paymentsConfigured, stripe, stripeWebhookSecret } from '@/lib/stripe';
import { bookingStoreConfigured } from '@/lib/supabase';

/**
 * What Stripe tells us, and the only account of a payment that is trusted.
 *
 * The signature is checked against STRIPE_WEBHOOK_SECRET before the body is
 * looked at, so an unsigned post is refused without reaching the database. The
 * raw text is read rather than the parsed JSON, because the signature covers
 * the bytes that were sent and not a re-serialisation of them.
 *
 * Everything here is idempotent. Stripe replays events, sometimes days later,
 * and the conversion is settled in the database under a row lock, so a replay
 * confirms nothing twice and sends no second email.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!paymentsConfigured || stripeWebhookSecret === '') {
    console.error('[stripe/webhook] STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is missing');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'unsigned' }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;

  try {
    event = await stripe().webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
  } catch (error) {
    console.error('[stripe/webhook] the signature did not check out', error);
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
  }

  if (!bookingStoreConfigured) {
    // Answer 500 on purpose: Stripe will retry, and by then the store may be
    // back. Acknowledging would throw the event away.
    console.error('[stripe/webhook] the booking store is not configured');
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        // Asserted rather than inferred: the event type is the guarantee of
        // what the payload is, and stripe-node types data.object loosely.
        const intent = event.data.object as Stripe.PaymentIntent;
        if (intent.metadata?.kind !== 'deposit') break;

        const settlement = await settleSucceededDeposit(intent);
        console.info('[stripe/webhook] deposit settled', intent.id, settlement.status);
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (intent.metadata?.kind !== 'deposit') break;

        // The hold is left standing on purpose: the visitor still has the rest
        // of its lifetime to try another card.
        await markDepositFailed(
          intent.id,
          intent.last_payment_error?.message ?? intent.last_payment_error?.code ?? 'payment_failed',
        );
        break;
      }

      default:
        break;
    }
  } catch (error) {
    // A 500 asks Stripe to send it again, which is what we want when the fault
    // was ours.
    console.error('[stripe/webhook] could not handle the event', event.type, error);
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
