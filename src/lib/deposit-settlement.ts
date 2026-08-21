import type Stripe from 'stripe';
import { sendDepositEmails, sendRefundAlert } from '@/lib/booking-emails';
import {
  confirmDepositPayment,
  markDepositRefunded,
  releaseHold,
  type ConfirmedBooking,
} from '@/lib/payments';
import { stripe } from '@/lib/stripe';

/**
 * What happens once a deposit has actually cleared, wherever the news arrives.
 *
 * Two things can tell us: the webhook, which is authoritative and arrives even
 * if the visitor closes the tab, and the browser coming back from the card
 * form, which is faster. Both land here, and the database decides which of them
 * is the one that converts the hold. The other is told `already` and sends
 * nothing, so a replayed webhook cannot produce a second confirmation email.
 */

export type Settlement =
  | { status: 'confirmed' | 'already'; booking: ConfirmedBooking }
  | { status: 'refunded'; booking: ConfirmedBooking }
  | { status: 'unknown' };

/** Stripe expands these lazily, so they arrive either as an id or as an object. */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

export async function settleSucceededDeposit(
  intent: Stripe.PaymentIntent,
): Promise<Settlement> {
  const customerId = idOf(intent.customer as string | { id: string } | null);

  // Only kept when the guest agreed to it. Stripe itself is the record of that:
  // without setup_future_usage the card was not saved and there is nothing to
  // charge the balance on later.
  const paymentMethodId = intent.setup_future_usage
    ? idOf(intent.payment_method as string | { id: string } | null)
    : null;

  const outcome = await confirmDepositPayment(intent.id, customerId, paymentMethodId);

  if (outcome.ok) {
    if (outcome.converted) {
      await sendDepositEmails(outcome.booking);
      return { status: 'confirmed', booking: outcome.booking };
    }

    return { status: 'already', booking: outcome.booking };
  }

  if (outcome.reason === 'unavailable') {
    // The hold ran out while the card was being authorised and the week went to
    // somebody else. The guest gets their money back, the host gets told, and
    // nothing is left half done.
    const reason = 'the nights were taken while the payment was being authorised';

    try {
      await stripe().refunds.create({
        payment_intent: intent.id,
        reason: 'requested_by_customer',
      });
    } catch (error) {
      console.error('[deposit] the refund itself failed, this needs a human', intent.id, error);
    }

    await markDepositRefunded(intent.id, reason).catch(() => undefined);
    await releaseHold(outcome.booking.reservationId).catch(() => undefined);
    await sendRefundAlert(outcome.booking, reason).catch(() => undefined);

    return { status: 'refunded', booking: outcome.booking };
  }

  console.error('[deposit] a payment succeeded with nothing to attach it to', intent.id);
  return { status: 'unknown' };
}
