/**
 * Plain calendar dates, written YYYY-MM-DD, with no time and no timezone.
 *
 * Every range in the booking flow is half open, [start, end): the nights run
 * from `start` up to but not including `end`, so a checkout day is free for the
 * next arrival. This is also what iCal means by an exclusive DTEND, which is why
 * the site, the database and the feeds all agree without conversion.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar day: 2026-02-30 is rejected, not silently rolled. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Today at the property, not at the visitor or at the server. A traveller in
 * Tokyo must not be offered a night that has already started in Le Pradet.
 */
export function todayInParis(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Nights covered by [from, to). Negative when the dates are the wrong way round. */
export function nightsBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

/** Compact YYYYMMDD, the shape an iCal DATE value takes. */
export function toIcalDate(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}
