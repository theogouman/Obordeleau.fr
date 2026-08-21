import {
  MAX_BALANCE_REMINDERS,
  claimDueBalances,
  ensureBalanceLinkToken,
  markBalanceActionRequired,
  markBalanceFailed,
  markBalanceReminded,
  releaseBalanceClaim,
  settleBalancePayment,
  type DueBalance,
} from '@/lib/balances';
import {
  balancePayUrl,
  sendBalanceHostAlert,
  sendBalanceLinkEmail,
  sendBalanceReceipt,
  type LinkReason,
} from '@/lib/balance-emails';
import { property } from '@/lib/content';
import { paymentsConfigured, stripe, stripeFailure, toMinorUnits } from '@/lib/stripe';

/**
 * The balance run.
 *
 * One pass over everything the database says is due. Each stay is claimed
 * before Stripe is asked anything, so two runs cannot charge the same card, and
 * every path out of here either records a result or hands the claim back. A
 * claim that is neither released nor resolved, because the process died mid
 * flight, is taken back by the next run after the stale window.
 *
 * Nothing here computes an amount. `balanceDue` was frozen when the deposit
 * cleared and is read, never rebuilt.
 */

export type BalanceRunSummary = {
  claimed: number;
  paid: number;
  actionRequired: number;
  failed: number;
  reminded: number;
  skipped: number;
  errors: number;
};

const EMPTY: BalanceRunSummary = {
  claimed: 0,
  paid: 0,
  actionRequired: 0,
  failed: 0,
  reminded: 0,
  skipped: 0,
  errors: 0,
};

/** The reason the guest is being asked, phrased from where the balance got stuck. */
function reasonFor(balance: DueBalance): LinkReason {
  if (balance.balanceStatus === 'failed') return 'failed';
  return balance.paymentMethodId ? 'authentication' : 'noCard';
}

async function linkFor(balance: DueBalance): Promise<string | null> {
  const token = balance.linkToken ?? (await ensureBalanceLinkToken(balance.reservationId));
  return token ? balancePayUrl(token) : null;
}

/**
 * The charge itself, off session, on the card the guest agreed to leave.
 *
 * The idempotency key is the stay and the amount, so a run that is retried
 * within the day replays Stripe's own answer instead of taking the money twice.
 */
async function chargeBalance(balance: DueBalance): Promise<keyof BalanceRunSummary> {
  // No saved card is not a failure. It is what a guest who declined the opt in
  // at checkout was told would happen: the balance is arranged rather than
  // taken, so they are asked for it now.
  if (!balance.customerId || !balance.paymentMethodId) {
    const url = await linkFor(balance);

    await markBalanceActionRequired({
      reservationId: balance.reservationId,
      intentId: null,
      code: 'no_saved_card',
      detail: 'no card was kept at checkout, so the balance has to be paid by the guest',
    });

    if (url) {
      await sendBalanceLinkEmail({ balance, url, reason: 'noCard', isReminder: false });
    }

    return 'actionRequired';
  }

  const amount = toMinorUnits(balance.balanceDue);

  try {
    const intent = await stripe().paymentIntents.create(
      {
        amount,
        currency: balance.currency.toLowerCase(),
        customer: balance.customerId,
        payment_method: balance.paymentMethodId,
        // Nobody is at the keyboard. Stripe needs to be told, both so the right
        // network rules apply and so it refuses rather than silently waiting.
        off_session: true,
        confirm: true,
        description: `${property.name} ${balance.startDate} ${balance.endDate}`,
        receipt_email: balance.guestEmail,
        metadata: {
          kind: 'balance',
          reservation_id: balance.reservationId,
          check_in: balance.startDate,
          check_out: balance.endDate,
        },
      },
      { idempotencyKey: `balance-${balance.reservationId}-${amount}` },
    );

    if (intent.status === 'succeeded') {
      const settled = await settleBalancePayment({
        reservationId: balance.reservationId,
        intentId: intent.id,
        source: 'charge',
      });

      // The webhook may have got here first. Only the caller that actually
      // changed the row sends the receipt.
      if (settled.ok && settled.changed) await sendBalanceReceipt(settled.booking);

      return 'paid';
    }

    if (intent.status === 'requires_action' || intent.status === 'requires_confirmation') {
      const url = await linkFor(balance);

      await markBalanceActionRequired({
        reservationId: balance.reservationId,
        intentId: intent.id,
        code: 'authentication_required',
        detail: `the card issuer asked for the cardholder (${intent.status})`,
      });

      if (url) {
        await sendBalanceLinkEmail({ balance, url, reason: 'authentication', isReminder: false });
      }

      return 'actionRequired';
    }

    if (intent.status === 'processing') {
      // Neither taken nor refused. The webhook settles it, so the claim is
      // simply handed back and nothing is said to anyone yet.
      await releaseBalanceClaim(balance.reservationId, 'the payment is still processing');
      return 'skipped';
    }

    const url = await linkFor(balance);

    await markBalanceFailed({
      reservationId: balance.reservationId,
      intentId: intent.id,
      code: intent.status,
      detail: `the payment ended as ${intent.status}`,
    });

    if (url) await sendBalanceLinkEmail({ balance, url, reason: 'failed', isReminder: false });
    await sendBalanceHostAlert({ balance, kind: 'failed', detail: intent.status, url });

    return 'failed';
  } catch (error) {
    const failure = stripeFailure(error);
    const url = await linkFor(balance);

    // The expected European case, and the reason the fallback exists at all.
    if (failure.code === 'authentication_required') {
      await markBalanceActionRequired({
        reservationId: balance.reservationId,
        intentId: failure.intentId,
        code: failure.code,
        detail: failure.message,
      });

      if (url) {
        await sendBalanceLinkEmail({ balance, url, reason: 'authentication', isReminder: false });
      }

      return 'actionRequired';
    }

    await markBalanceFailed({
      reservationId: balance.reservationId,
      intentId: failure.intentId,
      code: failure.code,
      detail: failure.message,
    });

    if (url) await sendBalanceLinkEmail({ balance, url, reason: 'failed', isReminder: false });
    await sendBalanceHostAlert({ balance, kind: 'failed', detail: failure.message, url });

    return 'failed';
  }
}

/**
 * A follow up. The card is not tried again: it already said what it had to say,
 * and asking it a second time in the same week is not what unblocks this.
 */
async function remindBalance(balance: DueBalance): Promise<keyof BalanceRunSummary> {
  const url = await linkFor(balance);

  if (!url) {
    await releaseBalanceClaim(balance.reservationId, 'no payment link could be minted');
    return 'errors';
  }

  await sendBalanceLinkEmail({ balance, url, reason: reasonFor(balance), isReminder: true });
  const sent = await markBalanceReminded(balance.reservationId);

  // Out of reminders. From here it is a telephone call, so the person who would
  // make it is told.
  if (sent >= MAX_BALANCE_REMINDERS) {
    await sendBalanceHostAlert({
      balance,
      kind: 'escalation',
      detail: `${sent} reminders sent with no payment`,
      url,
    });
  }

  return 'reminded';
}

export async function runDueBalances(limit = 25): Promise<BalanceRunSummary> {
  if (!paymentsConfigured) {
    console.error('[balance] STRIPE_SECRET_KEY is missing, nothing can be charged');
    return { ...EMPTY };
  }

  const due = await claimDueBalances(limit);
  const summary: BalanceRunSummary = { ...EMPTY, claimed: due.length };

  for (const balance of due) {
    try {
      const outcome =
        balance.balanceStatus === 'pending'
          ? await chargeBalance(balance)
          : await remindBalance(balance);

      summary[outcome] += 1;
    } catch (error) {
      // One stay going wrong must not stop the others, and above all must not
      // leave its claim standing: an unreleased claim is a balance nobody
      // charges until the stale window runs out.
      console.error('[balance] could not settle', balance.reservationId, error);
      summary.errors += 1;

      await releaseBalanceClaim(
        balance.reservationId,
        `the runner failed: ${error instanceof Error ? error.message : String(error)}`,
      ).catch(() => undefined);
    }
  }

  return summary;
}
