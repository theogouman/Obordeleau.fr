import { callDatabase } from '@/lib/supabase';

/**
 * The balance, and everything the runner needs to know about one.
 *
 * Stripe schedules nothing outside a subscription, so the decision of when is
 * taken here, in a daily job, and Stripe only executes. Nothing about Stripe is
 * stored in the database: the job posts to the site, which is where the secret
 * key already lives.
 *
 * The amount is the figure frozen at confirmation. `get_quote` is never called
 * again on this path, so a rate the owner changed in March cannot move what a
 * guest agreed to in January.
 */

/** How many follow ups a guest gets before a person has to pick up the phone. */
export const MAX_BALANCE_REMINDERS = 2;

/** Days between one attempt and the next reminder. */
export const BALANCE_RETRY_DAYS = 3;

/** A claim older than this belonged to a runner that is no longer running. */
export const BALANCE_STALE_MINUTES = 30;

export type BalanceStatus = 'pending' | 'paid' | 'action_required' | 'failed';

export type DueBalance = {
  reservationId: string;
  guestName: string;
  guestEmail: string;
  locale: string | null;
  startDate: string;
  endDate: string;
  partySize: number | null;
  adults: number;
  minors: number;
  /** Frozen at confirmation. Read, never recomputed. */
  balanceDue: number;
  balanceStatus: BalanceStatus;
  balanceChargeOn: string | null;
  currency: string;
  customerId: string | null;
  paymentMethodId: string | null;
  saveCardConsent: boolean;
  linkToken: string | null;
  attempts: number;
  remindersSent: number;
};

type DueRow = {
  reservation_id: string;
  guest_name: string;
  guest_email: string;
  locale: string | null;
  start_date: string;
  end_date: string;
  party_size: number | null;
  adults: number;
  minors: number;
  balance_due: number;
  balance_status: string;
  balance_charge_on: string | null;
  currency: string;
  customer_id: string | null;
  payment_method_id: string | null;
  save_card_consent: boolean;
  link_token: string | null;
  attempts: number;
  reminders_sent: number;
};

function asDueBalance(row: DueRow): DueBalance {
  return {
    reservationId: row.reservation_id,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    locale: row.locale,
    startDate: row.start_date,
    endDate: row.end_date,
    partySize: row.party_size,
    adults: Number(row.adults ?? 0),
    minors: Number(row.minors ?? 0),
    balanceDue: Number(row.balance_due),
    balanceStatus: row.balance_status as BalanceStatus,
    balanceChargeOn: row.balance_charge_on,
    currency: row.currency ?? 'EUR',
    customerId: row.customer_id,
    paymentMethodId: row.payment_method_id,
    saveCardConsent: row.save_card_consent === true,
    linkToken: row.link_token,
    attempts: Number(row.attempts ?? 0),
    remindersSent: Number(row.reminders_sent ?? 0),
  };
}

/**
 * Takes the balances that need work and marks them in flight, in one statement.
 *
 * The claim is a column rather than a row lock, because the work happens over
 * an http round trip to Stripe and a lock would not survive it. Two runs
 * overlapping therefore cannot pick up the same row, and a claim left behind by
 * a runner that died is taken back after the stale window.
 */
export async function claimDueBalances(limit = 25): Promise<DueBalance[]> {
  const rows = await callDatabase<DueRow[]>('claim_due_balances', {
    p_limit: limit,
    p_stale_minutes: BALANCE_STALE_MINUTES,
    p_max_reminders: MAX_BALANCE_REMINDERS,
  });

  return (rows ?? []).map(asDueBalance);
}

/** Hands a claim back without deciding anything. */
export async function releaseBalanceClaim(reservationId: string, detail: string): Promise<void> {
  await callDatabase<{ ok: boolean }>('release_balance_claim', {
    p_reservation_id: reservationId,
    p_detail: detail,
  });
}

/** The unguessable path segment behind the fallback link. Minted once and kept. */
export async function ensureBalanceLinkToken(reservationId: string): Promise<string | null> {
  const row = await callDatabase<{ ok: boolean; token?: string }>('ensure_balance_link_token', {
    p_reservation_id: reservationId,
  });

  return row.ok ? (row.token ?? null) : null;
}

export type BalanceByToken =
  | { found: false }
  | {
      found: true;
      reservationId: string;
      balanceDue: number;
      balanceStatus: BalanceStatus;
      currency: string;
      customerId: string | null;
      locale: string | null;
      guestEmail: string;
      guestName: string;
      startDate: string;
      endDate: string;
      reservationStatus: string;
    };

export async function balanceByLinkToken(token: string): Promise<BalanceByToken> {
  const row = await callDatabase<{
    found: boolean;
    reservation_id?: string;
    balance_due?: number;
    balance_status?: string;
    currency?: string;
    customer_id?: string | null;
    locale?: string | null;
    guest_email?: string;
    guest_name?: string;
    start_date?: string;
    end_date?: string;
    reservation_status?: string;
  }>('balance_by_link_token', { p_token: token });

  if (!row.found || !row.reservation_id) return { found: false };

  return {
    found: true,
    reservationId: row.reservation_id,
    balanceDue: Number(row.balance_due ?? 0),
    balanceStatus: (row.balance_status ?? 'pending') as BalanceStatus,
    currency: row.currency ?? 'EUR',
    customerId: row.customer_id ?? null,
    locale: row.locale ?? null,
    guestEmail: row.guest_email ?? '',
    guestName: row.guest_name ?? '',
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    reservationStatus: row.reservation_status ?? 'confirmed',
  };
}

export type SettledBalance = {
  reservationId: string;
  guestName: string;
  guestEmail: string;
  locale: string | null;
  startDate: string;
  endDate: string;
  partySize: number | null;
  adults: number;
  minors: number;
  balanceDue: number;
  depositAmount: number;
  currency: string;
};

export type BalanceSettlement =
  | { ok: true; changed: boolean; booking: SettledBalance }
  | { ok: false; reason: 'unknown_balance' };

/**
 * Paid, and paid once.
 *
 * The row is locked in the database and the first caller to find it unpaid is
 * the only one that comes back with `changed: true`, which is the caller that
 * sends the receipt. A replayed webhook sends nothing.
 */
export async function settleBalancePayment(input: {
  reservationId?: string | null;
  intentId?: string | null;
  sessionId?: string | null;
  source: 'webhook' | 'charge';
}): Promise<BalanceSettlement> {
  const row = await callDatabase<{
    ok: boolean;
    changed?: boolean;
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
    balance_due?: number;
    deposit_amount?: number;
    currency?: string;
  }>('settle_balance_payment', {
    p_reservation_id: input.reservationId ?? null,
    p_intent_id: input.intentId ?? null,
    p_session_id: input.sessionId ?? null,
    p_source: input.source,
  });

  if (!row.ok) return { ok: false, reason: 'unknown_balance' };

  return {
    ok: true,
    changed: row.changed === true,
    booking: {
      reservationId: row.reservation_id ?? '',
      guestName: row.guest_name ?? '',
      guestEmail: row.guest_email ?? '',
      locale: row.locale ?? null,
      startDate: row.start_date ?? '',
      endDate: row.end_date ?? '',
      partySize: row.party_size ?? null,
      adults: Number(row.adults ?? 0),
      minors: Number(row.minors ?? 0),
      balanceDue: Number(row.balance_due ?? 0),
      depositAmount: Number(row.deposit_amount ?? 0),
      currency: row.currency ?? 'EUR',
    },
  };
}

/** The bank wants the guest present, so the guest is asked. */
export async function markBalanceActionRequired(input: {
  reservationId: string;
  intentId: string | null;
  code: string;
  detail: string;
}): Promise<void> {
  await callDatabase<{ ok: boolean }>('mark_balance_action_required', {
    p_reservation_id: input.reservationId,
    p_intent_id: input.intentId,
    p_code: input.code,
    p_detail: input.detail,
    p_retry_days: BALANCE_RETRY_DAYS,
  });
}

/** The card said no for a reason tapping a bank app will not fix. */
export async function markBalanceFailed(input: {
  reservationId: string;
  intentId: string | null;
  code: string;
  detail: string;
}): Promise<void> {
  await callDatabase<{ ok: boolean }>('mark_balance_failed', {
    p_reservation_id: input.reservationId,
    p_intent_id: input.intentId,
    p_code: input.code,
    p_detail: input.detail,
    p_retry_days: BALANCE_RETRY_DAYS,
  });
}

export async function markBalanceReminded(reservationId: string): Promise<number> {
  const row = await callDatabase<{ ok: boolean; reminders_sent?: number }>('mark_balance_reminded', {
    p_reservation_id: reservationId,
    p_retry_days: BALANCE_RETRY_DAYS,
  });

  return Number(row.reminders_sent ?? 0);
}

/** So the webhook for a clicked link has something to match on. */
export async function recordBalanceSession(
  reservationId: string,
  sessionId: string,
): Promise<void> {
  await callDatabase<{ ok: boolean }>('record_balance_session', {
    p_reservation_id: reservationId,
    p_session_id: sessionId,
  });
}

/**
 * The secret the cron job sends in a header, read back from where the database
 * generated it. Never an environment variable, so it is never copied by hand
 * and rotating it is one update with no deploy.
 */
export async function runnerSecret(key: string): Promise<string | null> {
  const value = await callDatabase<string | null>('runner_secret', { p_key: key });
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export type AdminBalance = {
  reservationId: string;
  guestName: string;
  guestEmail: string;
  locale: string | null;
  startDate: string;
  endDate: string;
  reservationStatus: string;
  amount: number;
  currency: string;
  status: BalanceStatus;
  chargeOn: string | null;
  paidAt: string | null;
  attempts: number;
  reminders: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  consent: boolean;
  lastError: string | null;
};

type AdminBalanceRow = {
  b_reservation_id: string;
  b_guest_name: string;
  b_guest_email: string;
  b_locale: string | null;
  b_start_date: string;
  b_end_date: string;
  b_reservation_status: string;
  b_amount: number;
  b_currency: string;
  b_status: string;
  b_charge_on: string | null;
  b_paid_at: string | null;
  b_attempts: number;
  b_reminders: number;
  b_last_attempt_at: string | null;
  b_next_attempt_at: string | null;
  b_consent: boolean;
  b_last_error: string | null;
};

/** What the console lists: what needs a person first, then what is only waiting. */
export async function adminBalances(limit = 60): Promise<AdminBalance[]> {
  const rows = await callDatabase<AdminBalanceRow[]>('admin_balances', { p_limit: limit });

  return (rows ?? []).map((row) => ({
    reservationId: row.b_reservation_id,
    guestName: row.b_guest_name,
    guestEmail: row.b_guest_email,
    locale: row.b_locale,
    startDate: row.b_start_date,
    endDate: row.b_end_date,
    reservationStatus: row.b_reservation_status,
    amount: Number(row.b_amount),
    currency: row.b_currency ?? 'EUR',
    status: row.b_status as BalanceStatus,
    chargeOn: row.b_charge_on,
    paidAt: row.b_paid_at,
    attempts: Number(row.b_attempts ?? 0),
    reminders: Number(row.b_reminders ?? 0),
    lastAttemptAt: row.b_last_attempt_at,
    nextAttemptAt: row.b_next_attempt_at,
    consent: row.b_consent === true,
    lastError: row.b_last_error,
  }));
}
