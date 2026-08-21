import Stripe from 'stripe';

/**
 * The payment provider, server side only.
 *
 * `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` carry no NEXT_PUBLIC_ prefix
 * and never leave the server, the same discipline as the service role key and
 * ADMIN_SESSION_SECRET. Only the publishable key is given to the browser, which
 * is what it is for.
 *
 * Nothing here decides an amount. The figure charged comes from get_quote,
 * recomputed server side on every attempt.
 */

const SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';

export const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

/** Public by nature: it identifies the account and can do nothing on its own. */
export const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

/**
 * False until the owner sets both keys. The booking flow then falls back to the
 * enquiry it had before this lot rather than showing a card form that cannot
 * take a card (constitution VIII, no half built money paths).
 */
export const paymentsConfigured = SECRET_KEY !== '' && stripePublishableKey !== '';

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!paymentsConfigured) {
    throw new Error('STRIPE_SECRET_KEY or NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing');
  }

  client ??= new Stripe(SECRET_KEY, { maxNetworkRetries: 2, timeout: 20_000 });
  return client;
}

/**
 * Euros to the smallest unit Stripe counts in. Rounded once, here, from a
 * figure the database already rounded to the cent.
 */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * A payment intent still worth reusing. Anything else has either been paid,
 * cancelled or is in flight, and a fresh one is opened instead.
 */
export function isReusableIntentStatus(status: Stripe.PaymentIntent.Status): boolean {
  return (
    status === 'requires_payment_method' ||
    status === 'requires_confirmation' ||
    status === 'requires_action'
  );
}

export type StripeFailure = {
  /** The machine readable reason, `authentication_required` above all. */
  code: string;
  message: string;
  /** The intent Stripe opened before it refused, when there was one. */
  intentId: string | null;
};

/**
 * What went wrong, in the three parts the balance path acts on.
 *
 * An off session charge that needs the cardholder present does not come back as
 * a status: stripe-node throws, and `authentication_required` is on the error.
 * Telling that apart from a refusal is the whole difference between sending a
 * link and telling the owner a card has died.
 */
export function stripeFailure(error: unknown): StripeFailure {
  if (error instanceof Stripe.errors.StripeError) {
    const raw = error.raw as { payment_intent?: { id?: string } | string } | undefined;
    const intent = raw?.payment_intent;

    return {
      code: error.code ?? error.type ?? 'stripe_error',
      message: error.message ?? 'the payment provider refused the charge',
      intentId: typeof intent === 'string' ? intent : (intent?.id ?? null),
    };
  }

  return {
    code: 'unexpected_error',
    message: error instanceof Error ? error.message : String(error),
    intentId: null,
  };
}
