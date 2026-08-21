import { BookingStoreError, callDatabase } from '@/lib/supabase';

/**
 * Server side access to the price engine.
 *
 * Nothing here computes a price. Every figure comes from `get_quote` in the
 * database, which is the single authority: the amount shown to the visitor and
 * the amount Stripe is later asked to charge are the same call, so they cannot
 * drift apart, and a total sent up from a browser is never trusted.
 *
 * The four layers, most specific first: a manual override on the night, then
 * the last minute price, then the seasonal tier, then the base rate.
 */

export type PriceLayer = 'base' | 'tier' | 'last_minute' | 'override';

export type NightPrice = {
  /** The date the night starts on. */
  date: string;
  /** Null when the winning layer has no rate set yet: price on request. */
  resolvedPrice: number | null;
  layer: PriceLayer;
};

export type Quote = {
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  adults: number;
  minors: number;
  nights: NightPrice[];
  accommodationSubtotal: number;
  /** Zero means offered. The wording belongs to the UI, not here. */
  cleaningFee: number;
  /** Per adult and per night. Minors under 18 are exempt. */
  touristTax: number;
  total: number;
  depositPercentage: number;
  /** A share of the accommodation alone: cleaning and tax ride in the balance. */
  depositAmount: number;
  balanceAmount: number;
  currency: 'EUR';
};

type NightRow = { n_night: string; n_price: number | null; n_layer: string };

type QuoteRow = {
  check_in: string;
  check_out: string;
  nights_count: number;
  adults: number;
  minors: number;
  nights: { date: string; resolved_price: number | null; layer: string }[];
  accommodation_subtotal: number;
  cleaning_fee: number;
  tourist_tax: number;
  total: number;
  deposit_percentage: number;
  deposit_amount: number;
  balance_amount: number;
  currency: 'EUR';
};

/**
 * True when the store refused to quote because the owner has not set a rate.
 * The money path fails closed rather than inventing a number, so the caller
 * shows the enquiry form and the channel links instead of a price.
 */
export function isPricingNotConfigured(error: unknown): boolean {
  return error instanceof BookingStoreError && error.message.includes('pricing_not_configured');
}

/**
 * One resolved price per night in [from, to), for the calendar. Read only, and
 * cheap enough to ask for a whole month at a time.
 */
export async function nightlyPrices(from: string, to: string): Promise<NightPrice[]> {
  const rows = await callDatabase<NightRow[]>('resolve_nightly_prices', {
    p_from: from,
    p_to: to,
  });

  return rows.map((row) => ({
    date: row.n_night,
    resolvedPrice: row.n_price,
    layer: row.n_layer as PriceLayer,
  }));
}

/** Throws a BookingStoreError when no price can be quoted; see isPricingNotConfigured. */
export async function getQuote(
  checkIn: string,
  checkOut: string,
  adults: number,
  minors = 0,
): Promise<Quote> {
  const row = await callDatabase<QuoteRow>('get_quote', {
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_adults: adults,
    p_minors: minors,
  });

  return {
    checkIn: row.check_in,
    checkOut: row.check_out,
    nightsCount: row.nights_count,
    adults: row.adults,
    minors: row.minors,
    nights: row.nights.map((night) => ({
      date: night.date,
      resolvedPrice: night.resolved_price,
      layer: night.layer as PriceLayer,
    })),
    accommodationSubtotal: row.accommodation_subtotal,
    cleaningFee: row.cleaning_fee,
    touristTax: row.tourist_tax,
    total: row.total,
    depositPercentage: row.deposit_percentage,
    depositAmount: row.deposit_amount,
    balanceAmount: row.balance_amount,
    currency: row.currency,
  };
}

export type StayRefusalReason =
  | 'invalid_range'
  | 'too_soon'
  | 'min_nights'
  | 'checkin_day'
  | 'stay_multiple'
  | 'unavailable';

export type StayValidation =
  | { valid: true; reason: null }
  | {
      valid: false;
      reason: StayRefusalReason;
      minArrival?: string;
      minNights?: number;
      requiredCheckinDay?: string;
      stayMultiple?: number;
    };

type StayRow = {
  valid: boolean;
  reason: string | null;
  min_arrival?: string;
  min_nights?: number;
  required_checkin_day?: string;
  stay_multiple?: number;
};

/**
 * Validation, not pricing: the stay constraints of every season the dates touch,
 * plus availability. Used by the date picker to answer early and kindly, and
 * again server side before any payment is taken.
 */
export async function validateStay(checkIn: string, checkOut: string): Promise<StayValidation> {
  const row = await callDatabase<StayRow>('validate_stay', {
    p_check_in: checkIn,
    p_check_out: checkOut,
  });

  if (row.valid) return { valid: true, reason: null };

  const known: StayRefusalReason[] = [
    'invalid_range',
    'too_soon',
    'min_nights',
    'checkin_day',
    'stay_multiple',
    'unavailable',
  ];

  return {
    valid: false,
    reason: known.includes(row.reason as StayRefusalReason)
      ? (row.reason as StayRefusalReason)
      : 'unavailable',
    minArrival: row.min_arrival,
    minNights: row.min_nights,
    requiredCheckinDay: row.required_checkin_day,
    stayMultiple: row.stay_multiple,
  };
}
