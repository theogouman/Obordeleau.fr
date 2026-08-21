import { addDays } from '@/lib/dates';

/**
 * Month arithmetic on plain YYYY-MM-DD strings.
 *
 * No Date object ever escapes this file, and none of it is timezone aware: a
 * calendar month is a fact about the calendar, not about where the reader is
 * standing. The visitor picker in BookingCalendar.tsx holds an older copy of
 * the same shapes; it is left alone here on purpose, since this lot has no way
 * to compile a change to the visitor site.
 */

export function startOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${startOfMonth(isoDate)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function daysInMonth(isoDate: string): number {
  const date = new Date(`${startOfMonth(isoDate)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.getUTCDate();
}

/** 0 is Monday, which is where the French week starts. */
export function weekdayIndex(isoDate: string): number {
  return (new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** True for a Saturday, the arrival day the summer seasons ask for. */
export function isSaturday(isoDate: string): boolean {
  return weekdayIndex(isoDate) === 5;
}

/** The grid of a month, padded to whole weeks with nulls. */
export function weeksOf(monthStart: string): (string | null)[][] {
  const cells: (string | null)[] = Array<string | null>(weekdayIndex(monthStart)).fill(null);

  for (let day = 0; day < daysInMonth(monthStart); day += 1) {
    cells.push(addDays(monthStart, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

/** "YYYY-MM" if it really is one, otherwise null. */
export function parseMonth(value: string | undefined | null): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return null;
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) return null;
  return `${value}-01`;
}

const MONTH_NAMES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** The admin is French only, so the month name is a lookup, not an Intl call. */
export function monthLabel(monthStart: string): string {
  return `${MONTH_NAMES[Number(monthStart.slice(5, 7)) - 1]} ${monthStart.slice(0, 4)}`;
}

export const WEEKDAY_LABELS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

/** "samedi 12 juillet 2029", for a sentence rather than a grid. */
export function longDateLabel(isoDate: string): string {
  const days = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const day = Number(isoDate.slice(8, 10));
  return `${days[weekdayIndex(isoDate)]} ${day} ${MONTH_NAMES[Number(isoDate.slice(5, 7)) - 1]} ${isoDate.slice(0, 4)}`;
}

/** 1 is January. */
export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? '';
}

/**
 * The months a half open [start, endExclusive) range actually covers, by
 * number. The last night is the day before the exclusive end, so a season
 * running to the 1st of September stops in August.
 */
export function monthsCovered(start: string, endExclusive: string): number[] {
  const last = addDays(endExclusive, -1);
  if (last < start) return [];

  const months: number[] = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const lastYear = Number(last.slice(0, 4));
  const lastMonth = Number(last.slice(5, 7));

  // Bounded so a malformed row cannot spin here.
  while (months.length < 24 && (year < lastYear || (year === lastYear && month <= lastMonth))) {
    months.push(month);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
