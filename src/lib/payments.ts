import { callDatabase } from '@/lib/supabase';
import type { Quote } from '@/lib/pricing';

/**
 * The hold, and everything remembered about a deposit.
 *
 * Why a hold exists at all: between the moment a visitor sees an amount and the
 * moment their card clears, the nights have to belong to them. Writing the
 * booking only on the payment webhook would let two people pay a deposit for
 * the same week, and one of them would then have to be refunded a stay that was
 * never available. So the nights are taken first, briefly, and the same
 * exclusion constraint that settles two simultaneous bookings settles two
 * simultaneous checkouts, before any money moves.
 */

/**
 * How long a checkout holds the nights. Long enough to find a card and clear
 * 3D Secure, short enough that an abandoned checkout does not cost a booking.
 */
export const HOLD_MINUTES = 25;

export type HoldLookup =
  | { found: false }
  | { found: true; id: string; holdExpiresAt: string | null };

/**
 * The hold this visitor already has on these nights, with its life pushed out.
 *
 * Without it, coming back to a checkout is refused by the visitor's own hold:
 * busy is busy, whoever put it there.
 */
export async function findActiveHold(
  guestEmail: string,
  from: string,
  to: string,
  extendMinutes: number | null = HOLD_MINUTES,
): Promise<HoldLookup> {
  const row = await callDatabase<{
    found: boolean;
    id?: string;
    hold_expires_at?: string | null;
  }>('find_active_hold', {
    p_guest_email: guestEmail,
    p_start: from,
    p_end: to,
    p_extend_minutes: extendMinutes,
  });

  if (!row.found || !row.id) return { found: false };

  return { found: true, id: row.id, holdExpiresAt: row.hold_expires_at ?? null };
}

/** Hands the nights back, when a payment could not even be opened. */
export async function releaseHold(reservationId: string): Promise<boolean> {
  const row = await callDatabase<{ ok: boolean; released: boolean }>('release_reservation_hold', {
    p_reservation_id: reservationId,
  });

  return row.released === true;
}

export type DepositStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export type PaymentState =
  | { found: false }
  | {
      found: true;
      paymentIntentId: string | null;
      customerId: string | null;
      depositStatus: DepositStatus;
      depositAmount: number;
      saveCardConsent: boolean;
    };

/** What the last attempt on this hold left behind, so its intent can be reused. */
export async function checkoutPaymentState(reservationId: string): Promise<PaymentState> {
  const row = await callDatabase<{
    found: boolean;
    stripe_payment_intent_id?: string | null;
    stripe_customer_id?: string | null;
    deposit_status?: DepositStatus;
    deposit_amount?: number;
    save_card_consent?: boolean;
  }>('checkout_payment_state', { p_reservation_id: reservationId });

  if (!row.found) return { found: false };

  return {
    found: true,
    paymentIntentId: row.stripe_payment_intent_id ?? null,
    customerId: row.stripe_customer_id ?? null,
    depositStatus: row.deposit_status ?? 'pending',
    depositAmount: Number(row.deposit_amount ?? 0),
    saveCardConsent: row.save_card_consent === true,
  };
}

export type DepositIntentRecord = {
  reservationId: string;
  paymentIntentId: string;
  customerId: string | null;
  depositAmount: number;
  balanceDue: number;
  balanceChargeOn: string | null;
  saveCardConsent: boolean;
  adults: number;
  minors: number;
  quote: Quote;
};

/**
 * Written before the card is ever charged, so the webhook has somewhere to land
 * whatever order things arrive in. The quote is frozen here: lot 5 charges what
 * was agreed, never what the rates have since become.
 */
export async function recordDepositIntent(record: DepositIntentRecord): Promise<void> {
  await callDatabase<{ ok: boolean }>('record_deposit_intent', {
    p_reservation_id: record.reservationId,
    p_payment_intent_id: record.paymentIntentId,
    p_customer_id: record.customerId,
    p_deposit_amount: record.depositAmount,
    p_balance_due: record.balanceDue,
    p_balance_charge_on: record.balanceChargeOn,
    p_save_card_consent: record.saveCardConsent,
    p_adults: record.adults,
    p_minors: record.minors,
    p_quote: record.quote,
  });
}

export type ConfirmedBooking = {
  reservationId: string;
  guestName: string;
  guestEmail: string;
  locale: string | null;
  startDate: string;
  endDate: string;
  partySize: number | null;
  adults: number;
  minors: number;
  depositAmount: number;
  balanceDue: number;
  balanceChargeOn: string | null;
  saveCardConsent: boolean;
  currency: string;
};

export type ConfirmationOutcome =
  | { ok: true; converted: boolean; booking: ConfirmedBooking }
  | { ok: false; reason: 'unavailable'; booking: ConfirmedBooking }
  | { ok: false; reason: 'unknown_payment' | 'unknown_reservation' };

type ConfirmationRow = {
  ok: boolean;
  converted?: boolean;
  reason?: string;
  reservation_id?: string;
  guest_name?: string;
  guest_email?: string;
  locale?: string | null;
  start_date?: string;
  end_date?: string;
  party_size?: number | null;
  adults?: number;
  minors?: number;
  deposit_amount?: number;
  balance_due?: number;
  balance_charge_on?: string | null;
  save_card_consent?: boolean;
  currency?: string;
};

function asBooking(row: ConfirmationRow): ConfirmedBooking {
  return {
    reservationId: row.reservation_id ?? '',
    guestName: row.guest_name ?? '',
    guestEmail: row.guest_email ?? '',
    locale: row.locale ?? null,
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    partySize: row.party_size ?? null,
    adults: Number(row.adults ?? 0),
    minors: Number(row.minors ?? 0),
    depositAmount: Number(row.deposit_amount ?? 0),
    balanceDue: Number(row.balance_due ?? 0),
    balanceChargeOn: row.balance_charge_on ?? null,
    saveCardConsent: row.save_card_consent === true,
    currency: row.currency ?? 'EUR',
  };
}

/**
 * Turns a paid deposit into a booking, once.
 *
 * The webhook and the browser both call this, and Stripe replays webhooks. The
 * database locks the payment row, so exactly one caller comes back with
 * `converted: true`, which is the caller that sends the emails.
 */
export async function confirmDepositPayment(
  paymentIntentId: string,
  customerId: string | null,
  paymentMethodId: string | null,
): Promise<ConfirmationOutcome> {
  const row = await callDatabase<ConfirmationRow>('confirm_reservation_payment', {
    p_payment_intent_id: paymentIntentId,
    p_customer_id: customerId,
    p_payment_method_id: paymentMethodId,
  });

  if (row.ok) {
    return { ok: true, converted: row.converted === true, booking: asBooking(row) };
  }

  if (row.reason === 'unavailable') {
    return { ok: false, reason: 'unavailable', booking: asBooking(row) };
  }

  return {
    ok: false,
    reason: row.reason === 'unknown_reservation' ? 'unknown_reservation' : 'unknown_payment',
  };
}

/** A refused card. The hold is left standing so another one can be tried. */
export async function markDepositFailed(paymentIntentId: string, reason: string): Promise<void> {
  await callDatabase<{ ok: boolean }>('mark_deposit_failed', {
    p_payment_intent_id: paymentIntentId,
    p_error: reason,
  });
}

/** Recorded after the money has actually been sent back at Stripe. */
export async function markDepositRefunded(paymentIntentId: string, reason: string): Promise<void> {
  await callDatabase<{ ok: boolean }>('mark_deposit_refunded', {
    p_payment_intent_id: paymentIntentId,
    p_reason: reason,
  });
}
