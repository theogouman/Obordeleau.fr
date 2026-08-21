import dialData from '@content/dial-codes.json';

/**
 * Country calling codes for the booking form.
 *
 * The data file holds nothing but ISO codes and calling codes. The country name
 * comes from `Intl.DisplayNames` in the visitor's own language, so the list is
 * translated for free and stays correct in all three catalogues (constitution
 * III), and the flag is computed from the ISO code rather than shipped as an
 * image.
 */

export type DialOption = {
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** E.164 calling code, without the plus sign. */
  dial: string;
  name: string;
  flag: string;
};

const CODES = dialData.codes as Record<string, string>;
const PRIORITY = dialData.priority as string[];
const FALLBACK_BY_LOCALE = dialData.fallbackByLocale as Record<string, string>;

/**
 * Almost every numbering plan drops the national trunk 0 when the number is
 * dialled from abroad. Italy is the well known exception: an Italian landline
 * keeps its leading 0, and San Marino and the Vatican follow the same plan.
 */
const KEEP_TRUNK_ZERO = new Set(dialData.keepTrunkZero as string[]);

const GROUPING = dialData.grouping as Record<string, number[]>;
const DEFAULT_GROUPING = dialData.defaultGrouping as number[];

/**
 * Regional indicator symbols: two letters become the flag of that country in
 * every font that carries them, and degrade to the two letters where they do
 * not.
 */
function flagOf(country: string): string {
  return String.fromCodePoint(
    ...[...country.toUpperCase()].map((letter) => 0x1f1a5 + letter.charCodeAt(0)),
  );
}

export function isKnownCountry(country: string | null | undefined): boolean {
  return typeof country === 'string' && Object.hasOwn(CODES, country.toUpperCase());
}

export function dialFor(country: string): string {
  return CODES[country.toUpperCase()] ?? '';
}

/**
 * The country the form should start on: what the visitor's connection says,
 * then the language they are reading, then France.
 */
export function defaultCountry(fromRequest: string | null | undefined, locale: string): string {
  if (isKnownCountry(fromRequest)) return String(fromRequest).toUpperCase();
  return FALLBACK_BY_LOCALE[locale] ?? 'FR';
}

/**
 * The seven countries the guests actually come from first, then everywhere
 * else in alphabetical order for the language being read.
 */
export function dialOptions(localeTag: string): { priority: DialOption[]; rest: DialOption[] } {
  const names = new Intl.DisplayNames([localeTag], { type: 'region' });

  const build = (country: string): DialOption => ({
    country,
    dial: CODES[country],
    name: names.of(country) ?? country,
    flag: flagOf(country),
  });

  const priority = PRIORITY.filter((country) => Object.hasOwn(CODES, country)).map(build);

  const rest = Object.keys(CODES)
    .filter((country) => !PRIORITY.includes(country))
    .map(build)
    .sort((a, b) => a.name.localeCompare(b.name, localeTag));

  return { priority, rest };
}

/**
 * Spaces a run of digits along a national pattern, falling back to groups of
 * three once the pattern runs out. This is the one place a phone number is ever
 * spaced, so a number reads the same while it is typed, in the recap and in the
 * email the host receives.
 */
function groupDigits(digits: string, groups: readonly number[]): string {
  const parts: string[] = [];
  let index = 0;

  for (const size of groups) {
    if (index >= digits.length) break;
    parts.push(digits.slice(index, index + size));
    index += size;
  }

  // A number longer than its pattern keeps going in threes rather than running
  // into one unreadable block.
  while (index < digits.length) {
    parts.push(digits.slice(index, index + 3));
    index += 3;
  }

  // A single digit left on its own reads as a typing mistake, so it joins the
  // group before it.
  if (parts.length > 1 && parts[parts.length - 1].length === 1) {
    parts[parts.length - 2] += parts.pop();
  }

  return parts.join(' ');
}

/**
 * The same pattern once the leading digits are gone. Dropping the trunk 0 of an
 * 06 12 34 56 78 has to shorten the first group rather than shift every one of
 * them, otherwise the international form comes out as 61 23 45 678 instead of
 * the 6 12 34 56 78 everyone writes.
 */
function shiftGroups(groups: readonly number[], dropped: number): number[] {
  const shifted = [...groups];
  let left = dropped;

  while (left > 0 && shifted.length > 0) {
    const taken = Math.min(shifted[0], left);
    shifted[0] -= taken;
    left -= taken;
    if (shifted[0] === 0) shifted.shift();
  }

  return shifted;
}

function groupingFor(country: string): readonly number[] {
  return GROUPING[country.toUpperCase()] ?? DEFAULT_GROUPING;
}

/**
 * Spaces the number as it is typed, following the national grouping of the
 * chosen country. Nothing is added or removed, so the caret keeps its meaning
 * and a paste still works.
 */
export function formatNational(country: string, input: string): string {
  const digits = phoneDigits(input);
  if (digits === '') return '';
  return groupDigits(digits, groupingFor(country));
}

/** Digits only, so a number typed with spaces, dots or dashes still counts. */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * What gets sent to the host, and what the recap shows: one international
 * number, spaced by the same rule as the field it was typed into. A number
 * pasted in international form keeps its meaning rather than gaining a second
 * country code.
 */
export function fullPhoneNumber(country: string, national: string): string {
  const dial = dialFor(country);
  let digits = phoneDigits(national);
  if (digits === '' || dial === '') return '';

  if (digits.startsWith(`00${dial}`)) {
    digits = digits.slice(2 + dial.length);
  } else if (national.trim().startsWith('+') && digits.startsWith(dial)) {
    digits = digits.slice(dial.length);
  }

  let dropped = 0;
  if (!KEEP_TRUNK_ZERO.has(country.toUpperCase())) {
    const withoutTrunk = digits.replace(/^0+/, '');
    dropped = digits.length - withoutTrunk.length;
    digits = withoutTrunk;
  }

  if (digits === '') return '';
  return `+${dial} ${groupDigits(digits, shiftGroups(groupingFor(country), dropped))}`;
}
