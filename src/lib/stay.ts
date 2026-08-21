import { addDays, nightsBetween } from '@/lib/dates';

/**
 * The stay constraints, and the picker's copy of the rule.
 *
 * The database is the authority: `validate_stay` decides, the write path
 * re-applies it, and lot 4 will ask again before taking money. What lives here
 * is a mirror, and it exists for one reason only, which is that a picker cannot
 * guide by asking the server about every square in the grid. It greys out what
 * the server would refuse; the server is still the one that refuses.
 *
 * Keep it a mirror. The shape below is exactly what public_stay_rules sends,
 * and the two predicates follow validate_stay step for step: the constraints
 * that apply to a range are the union over every season the range touches, plus
 * the out of season default when any night falls outside them all.
 */

export type CheckinConstraint = 'any' | 'saturday';

export type Season = {
  label: string;
  startDate: string;
  /** Exclusive: the first date the season no longer covers. */
  endDate: string;
  minNights: number;
  checkinConstraint: CheckinConstraint;
  stayMultiple: number | null;
};

export type StayRules = {
  today: string;
  /** No same day booking: the earliest arrival is tomorrow at the property. */
  minArrival: string;
  defaultMinNights: number;
  seasons: Season[];
};

export type StayConstraints = {
  minNights: number;
  needsSaturday: boolean;
  stayMultiple: number | null;
  /** The seasons the range actually touches, for phrasing the refusal. */
  seasons: Season[];
};

/** Monday is 0, so Saturday is 5. Same convention as the calendar grid. */
function weekday(isoDate: string): number {
  return (new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function isSaturday(isoDate: string): boolean {
  return weekday(isoDate) === 5;
}

function covers(season: Season, night: string): boolean {
  return night >= season.startDate && night < season.endDate;
}

/** Half open, so a range ending on the first day of a season does not touch it. */
function overlaps(season: Season, from: string, to: string): boolean {
  return from < season.endDate && to > season.startDate;
}

export function seasonOf(rules: StayRules | null, night: string): Season | null {
  if (!rules) return null;
  return rules.seasons.find((season) => covers(season, night)) ?? null;
}

/**
 * The union over every season the range touches, plus the default when any
 * night of it falls outside them all. A stay spilling from June into July is
 * therefore held to the July rule, which is what validate_stay does.
 */
export function constraintsFor(
  rules: StayRules | null,
  from: string,
  to: string,
): StayConstraints {
  if (!rules) {
    return { minNights: 1, needsSaturday: false, stayMultiple: null, seasons: [] };
  }

  const touched = rules.seasons.filter((season) => overlaps(season, from, to));

  let minNights = 0;
  let needsSaturday = false;
  let stayMultiple: number | null = null;

  for (const season of touched) {
    minNights = Math.max(minNights, season.minNights);
    if (season.checkinConstraint === 'saturday') needsSaturday = true;
    if (season.stayMultiple !== null) {
      stayMultiple = Math.max(stayMultiple ?? 0, season.stayMultiple);
    }
  }

  const nights = Math.max(nightsBetween(from, to), 0);
  const hasUntieredNight = Array.from({ length: nights }, (_, offset) =>
    addDays(from, offset),
  ).some((night) => !touched.some((season) => covers(season, night)));

  if (hasUntieredNight || touched.length === 0) {
    minNights = Math.max(minNights, rules.defaultMinNights);
  }

  return { minNights, needsSaturday, stayMultiple, seasons: touched };
}

/**
 * Can a stay start here?
 *
 * Judged on the season the arrival itself falls in, because the length is not
 * known yet. A range that later runs into a stricter season is caught by
 * isValidDeparture, which sees both ends.
 */
export function isValidArrival(rules: StayRules | null, date: string): boolean {
  if (!rules) return true;
  if (date < rules.minArrival) return false;

  const season = seasonOf(rules, date);
  if (season && season.checkinConstraint === 'saturday' && !isSaturday(date)) return false;

  return true;
}

/** Does [arrival, departure) satisfy every constraint it has picked up? */
export function satisfiesStayRules(
  rules: StayRules | null,
  arrival: string,
  departure: string,
): boolean {
  if (!rules) return departure > arrival;

  const nights = nightsBetween(arrival, departure);
  if (nights < 1) return false;

  const { minNights, needsSaturday, stayMultiple } = constraintsFor(rules, arrival, departure);

  if (nights < minNights) return false;
  if (needsSaturday && !isSaturday(arrival)) return false;
  if (stayMultiple !== null && nights % stayMultiple !== 0) return false;

  return true;
}

/**
 * The reason a range is refused, in the vocabulary validate_stay answers in, so
 * the picker and the server say the same thing to the visitor.
 */
export type StayRefusal = 'too_soon' | 'min_nights' | 'checkin_day' | 'stay_multiple' | null;

export function refusalFor(
  rules: StayRules | null,
  arrival: string,
  departure: string,
): StayRefusal {
  if (!rules) return null;
  if (arrival < rules.minArrival) return 'too_soon';

  const nights = nightsBetween(arrival, departure);
  const { minNights, needsSaturday, stayMultiple } = constraintsFor(rules, arrival, departure);

  if (nights < minNights) return 'min_nights';
  if (needsSaturday && !isSaturday(arrival)) return 'checkin_day';
  if (stayMultiple !== null && nights % stayMultiple !== 0) return 'stay_multiple';

  return null;
}

/**
 * The soonest departure a stay from `arrival` could have, or null when the run
 * of free nights ahead of it cannot satisfy the rule at all. The picker uses it
 * to say so rather than leaving every square dead with no explanation.
 */
export function firstValidDeparture(
  rules: StayRules | null,
  arrival: string,
  limitInclusive: string,
): string | null {
  // Bounded so a malformed rule cannot spin here. A year of nights is already
  // far past any stay this property takes.
  for (let offset = 1; offset <= 400; offset += 1) {
    const candidate = addDays(arrival, offset);
    if (candidate > limitInclusive) return null;
    if (satisfiesStayRules(rules, arrival, candidate)) return candidate;
  }
  return null;
}

/**
 * The last date a stay from `arrival` could check out on: the first taken night
 * ahead of it, whose own date is still a valid checkout, or the end of the
 * window. Shared by the grid and by the hint under it, so the two cannot
 * disagree about how far a stay may run.
 */
export function lastCheckout(
  blocked: ReadonlySet<string>,
  arrival: string,
  windowEnd: string,
): string {
  let cursor = addDays(arrival, 1);
  while (cursor < windowEnd && !blocked.has(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}
