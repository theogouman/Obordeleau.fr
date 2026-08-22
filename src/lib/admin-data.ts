import { callDatabase } from '@/lib/supabase';
import type { PriceLayer } from '@/lib/pricing';

/**
 * The admin console's read and write surface.
 *
 * Every figure it hands to the page comes back from the lot 1 engine through
 * `admin_calendar`, so what Corine sees is what a visitor would be quoted. The
 * console edits settings; it never prices anything itself.
 *
 * The service role key is what reaches the database here, which is exactly why
 * every caller sits behind requireAdmin().
 */

export type PricingConfigRow = {
  base_nightly_rate: number | null;
  cleaning_fee: number;
  tourist_tax_per_adult_night: number;
  deposit_percentage: number;
  deposit_charge_days_before_arrival: number | null;
  /** Above this many days before arrival, a deposit is offered. Strictly above. */
  deposit_min_advance_days: number;
  /** And above this total, cleaning and tax included. Strictly above. */
  deposit_min_total: number;
  default_min_nights: number;
};

export type LastMinuteRow = {
  enabled: boolean;
  window_days: number | null;
  discounted_price: number | null;
  floor_price: number | null;
};

export type CheckinConstraint = 'any' | 'saturday';

export type TierRow = {
  id: string;
  label: string;
  start_date: string;
  /** Exclusive: the first date the season no longer covers. */
  end_date: string;
  nightly_rate: number | null;
  is_last_minute_exempt: boolean;
  min_nights: number;
  checkin_constraint: CheckinConstraint;
  stay_multiple: number | null;
};

export type AdminSettings = {
  today: string;
  config: PricingConfigRow | null;
  lastMinute: LastMinuteRow | null;
  tiers: TierRow[];
};

export type BusyKind = 'reservation' | 'hold' | 'manual' | 'external';

export type CalendarNight = {
  date: string;
  /** Null when the winning layer has no rate set: nothing can be quoted. */
  price: number | null;
  layer: PriceLayer;
  /** The raw override sitting under the night, when there is one. */
  override: number | null;
  busy: BusyKind | null;
  platform: string | null;
};

export type WriteResult = { ok: true } | { ok: false; reason: string };

export type OverrideResult =
  | { ok: true; nights_set: number; nights_skipped: number }
  | { ok: false; reason: string };

export type ClearResult = { ok: true; nights_cleared: number } | { ok: false; reason: string };

export async function adminSettings(): Promise<AdminSettings> {
  const row = await callDatabase<{
    today: string;
    config: PricingConfigRow | null;
    last_minute: LastMinuteRow | null;
    tiers: TierRow[];
  }>('admin_pricing_settings', {});

  return {
    today: row.today,
    config: row.config,
    lastMinute: row.last_minute,
    tiers: row.tiers ?? [],
  };
}

type CalendarRow = {
  c_night: string;
  c_price: number | null;
  c_layer: string;
  c_override: number | null;
  c_busy: string | null;
  c_platform: string | null;
};

/** Half open [from, to), the convention everything in this project shares. */
export async function adminCalendar(from: string, to: string): Promise<CalendarNight[]> {
  const rows = await callDatabase<CalendarRow[]>('admin_calendar', { p_from: from, p_to: to });

  return rows.map((row) => ({
    date: row.c_night,
    price: row.c_price,
    layer: row.c_layer as PriceLayer,
    override: row.c_override,
    busy: row.c_busy as BusyKind | null,
    platform: row.c_platform,
  }));
}

export async function saveConfig(input: {
  baseNightlyRate: number | null;
  cleaningFee: number;
  touristTaxPerAdultNight: number;
  depositPercentage: number;
  depositChargeDaysBeforeArrival: number | null;
  depositMinAdvanceDays: number;
  depositMinTotal: number;
  defaultMinNights: number;
}): Promise<WriteResult> {
  return callDatabase<WriteResult>('admin_save_pricing_config', {
    p_base_nightly_rate: input.baseNightlyRate,
    p_cleaning_fee: input.cleaningFee,
    p_tourist_tax_per_adult_night: input.touristTaxPerAdultNight,
    p_deposit_percentage: input.depositPercentage,
    p_deposit_charge_days_before_arrival: input.depositChargeDaysBeforeArrival,
    p_deposit_min_advance_days: input.depositMinAdvanceDays,
    p_deposit_min_total: input.depositMinTotal,
    p_default_min_nights: input.defaultMinNights,
  });
}

export async function saveLastMinute(input: {
  enabled: boolean;
  windowDays: number | null;
  discountedPrice: number | null;
  floorPrice: number | null;
}): Promise<WriteResult> {
  return callDatabase<WriteResult>('admin_save_last_minute', {
    p_enabled: input.enabled,
    p_window_days: input.windowDays,
    p_discounted_price: input.discountedPrice,
    p_floor_price: input.floorPrice,
  });
}

export async function saveTier(input: {
  id: string | null;
  label: string;
  startDate: string;
  endDate: string;
  nightlyRate: number | null;
  isLastMinuteExempt: boolean;
  minNights: number;
  checkinConstraint: CheckinConstraint;
  stayMultiple: number | null;
}): Promise<WriteResult> {
  return callDatabase<WriteResult>('admin_save_tier', {
    p_id: input.id,
    p_label: input.label,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_nightly_rate: input.nightlyRate,
    p_is_last_minute_exempt: input.isLastMinuteExempt,
    p_min_nights: input.minNights,
    p_checkin_constraint: input.checkinConstraint,
    p_stay_multiple: input.stayMultiple,
  });
}

export async function setOverride(
  from: string,
  to: string,
  nightlyRate: number,
): Promise<OverrideResult> {
  return callDatabase<OverrideResult>('admin_set_override', {
    p_from: from,
    p_to: to,
    p_nightly_rate: nightlyRate,
    p_reason: null,
  });
}

export async function clearOverride(from: string, to: string): Promise<ClearResult> {
  return callDatabase<ClearResult>('admin_clear_override', { p_from: from, p_to: to });
}
