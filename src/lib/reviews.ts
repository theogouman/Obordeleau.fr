import curation from '@content/reviews-curation.json';
import rawReviews from '@content/reviews.json';
import { routing, type Locale } from '@/i18n/routing';

/**
 * Reviews are a one-time export owned by content/reviews.json. Rules come from
 * specs/001-obordeleau-site/reviews-curation.md:
 *  - display the first name only (constitution VI, data minimisation)
 *  - avatars served locally (FR-010), initials fallback when absent
 *
 * FR-007 used to say the original language was kept and never retranslated,
 * which left an English or a German reader in front of a wall of French: most
 * of these were written in French, and a review nobody can read is not
 * evidence of anything. Every review now carries a reading in each of the four
 * languages, written as an adaptation rather than word for word, and the
 * original is still the one shown to a reader of its own language. What is
 * kept from the old rule is that nothing is passed off as original: a reading
 * that is not the words the guest typed says so on the card.
 */

export type ReviewLanguage = 'fr' | 'en' | 'de' | 'it' | 'other';

type RawReview = {
  id?: string | number;
  translations?: Record<string, string>;
  reviewer_name?: string;
  rating?: number | string;
  date?: string;
  date_iso?: string;
  review_fr?: string;
  text?: string;
  lang?: string;
  image_filename?: string;
  has_custom_photo?: boolean;
  source?: string;
};

/** Where the review was written. Everything without a source came from Airbnb. */
export type ReviewSource = 'airbnb' | 'booking';

export type Review = {
  id: string;
  firstName: string;
  initials: string;
  rating: number;
  dateLabel: string;
  dateIso: string;
  /** The words the guest typed, in the language they typed them in. */
  text: string;
  language: ReviewLanguage;
  /** A reading in each of the other languages. Server side only. */
  translations: Partial<Record<Locale, string>>;
  avatar: string | null;
  source: ReviewSource;
};

/**
 * What a card is given: one reading, already chosen for the page's language,
 * and the language it was written in when that reading is a translation.
 *
 * The choosing happens on the server on purpose. The reviews page hands its
 * cards to a client component, so everything on this object is serialised into
 * the document; carrying four readings of every review would put four times
 * the text on the wire to show one of them.
 */
export type LocalizedReview = Omit<Review, 'translations'> & {
  translatedFrom: ReviewLanguage | null;
};

const GERMAN_MARKERS =
  /\b(und|sehr|wir|war|ist|nicht|sehr|wohnung|strand|schön|gemütlich|alles|gut|die|der|das|zu fuß|klein|sauber)\b/gi;
const ENGLISH_MARKERS =
  /\b(the|and|was|were|very|beach|apartment|studio|clean|great|walk|stay|we|nice|would|everything)\b/gi;
const FRENCH_MARKERS =
  /\b(et|le|la|les|nous|très|tres|plage|studio|propre|séjour|sejour|bien|accueil|tout|est|à pied|a pied)\b/gi;
const ITALIAN_MARKERS =
  /\b(e|il|la|gli|molto|abbiamo|siamo|spiaggia|appartamento|monolocale|pulito|soggiorno|bene|tutto|posto|casa|a piedi|ottimo|consigliato)\b/gi;

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/** Best effort detection, only used to tag a review, never to translate it. */
export function detectLanguage(text: string): ReviewLanguage {
  const scores: Array<[ReviewLanguage, number]> = [
    ['de', countMatches(text, GERMAN_MARKERS)],
    ['en', countMatches(text, ENGLISH_MARKERS)],
    ['fr', countMatches(text, FRENCH_MARKERS)],
    ['it', countMatches(text, ITALIAN_MARKERS)],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = scores[0];
  const [, secondScore] = scores[1];

  if (bestScore === 0) return 'other';
  if (bestScore === secondScore) return 'fr';
  return best;
}

function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function normalizeId(value: RawReview['id'], index: number): string {
  if (value === undefined || value === null || value === '') {
    return String(index + 1).padStart(3, '0');
  }
  return String(value).padStart(3, '0');
}

function normalize(raw: RawReview, index: number): Review | null {
  const text = (raw.review_fr ?? raw.text ?? '').trim();
  if (!text) return null;

  const id = normalizeId(raw.id, index);
  const fullName = (raw.reviewer_name ?? '').trim();
  const rating = Number(raw.rating);
  const hasPhoto = raw.has_custom_photo !== false && Boolean(raw.image_filename);
  const declared = raw.lang as ReviewLanguage | undefined;

  const translations: Partial<Record<Locale, string>> = {};
  for (const locale of routing.locales) {
    const reading = raw.translations?.[locale]?.trim();
    if (reading) translations[locale] = reading;
  }

  return {
    id,
    firstName: firstNameOf(fullName) || id,
    initials: initialsOf(fullName),
    rating: Number.isFinite(rating) ? Math.min(5, Math.max(1, rating)) : 5,
    dateLabel: (raw.date ?? raw.date_iso ?? '').trim(),
    dateIso: (raw.date_iso ?? '').trim(),
    text,
    language:
      declared && ['fr', 'en', 'de', 'it', 'other'].includes(declared)
        ? declared
        : detectLanguage(text),
    translations,
    avatar: hasPhoto ? `/images/reviews/${raw.image_filename}` : null,
    source: (raw.source ?? '').trim().toLowerCase() === 'booking' ? 'booking' : 'airbnb',
  };
}

function byNewestFirst(a: Review, b: Review): number {
  if (a.dateIso && b.dateIso) return b.dateIso.localeCompare(a.dateIso);
  if (a.dateIso) return -1;
  if (b.dateIso) return 1;
  return b.id.localeCompare(a.id);
}

/** All reviews, newest first. Empty until the owner drops in the export. */
export const allReviews: Review[] = (rawReviews.reviews as RawReview[])
  .map(normalize)
  .filter((review): review is Review => review !== null)
  .sort(byNewestFirst);

export const reviewCount = allReviews.length;

/** The unrounded mean, for the badge that prints two decimals. */
export const averageRatingExact =
  reviewCount === 0
    ? 0
    : allReviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount;

/**
 * Rounded down, not to the nearest tenth.
 *
 * The exact mean is 4.958, which `Math.round` turned into a flat 5, published
 * as such in the structured data. It was defensible arithmetic and a bad
 * claim: a perfect 5 out of 168 reviews is the shape review-fraud detection
 * looks for, GuestFavourite prints the true 4.96 a few pixels away, and the
 * reviews page shows the three star review that makes 5 impossible. Rounding
 * down is never flattering by accident, and 4.9 is not a weaker number.
 */
export const averageRating = Math.floor(averageRatingExact * 10) / 10;

export const hasReviews = reviewCount > 0;

/**
 * Homepage selection: the curated ids from the curation spec, capped, with the
 * internationally written ones kept in the mix so EN and DE visitors see
 * themselves. Falls back to the strongest recent reviews if the curated ids are
 * not present in the export.
 */
export function curatedReviews(limit = curation.homepageMax): Review[] {
  const byId = new Map(allReviews.map((review) => [review.id, review]));
  const picked: Review[] = [];

  for (const id of curation.internationalPicks) {
    const review = byId.get(id);
    if (review) picked.push(review);
  }

  for (const id of curation.homepageCandidateIds) {
    if (picked.length >= limit) break;
    const review = byId.get(id);
    if (review && !picked.some((item) => item.id === review.id)) picked.push(review);
  }

  if (picked.length < curation.homepageMin) {
    for (const review of allReviews) {
      if (picked.length >= curation.homepageMin) break;
      if (review.rating === 5 && !picked.some((item) => item.id === review.id)) picked.push(review);
    }
  }

  return picked.slice(0, limit).sort(byNewestFirst);
}

/** Short, location forward lines used in the hero. */
export function heroQuotes(limit = curation.heroQuoteMax): Review[] {
  const byId = new Map(allReviews.map((review) => [review.id, review]));
  return curation.heroQuoteIds
    .map((id) => byId.get(id))
    .filter((review): review is Review => Boolean(review))
    .slice(0, limit);
}

/**
 * One review, read in one language.
 *
 * A reader of the review's own language gets the words as they were written
 * and no mention: there is nothing to disclose. Everyone else gets the reading
 * in their language and is told what it was written in. A missing reading
 * falls back to the original rather than to nothing, and stays unmarked,
 * because the mention has to mean "these are not their words" and would be a
 * lie over the words themselves.
 */
export function localize(review: Review, locale: Locale): LocalizedReview {
  const { translations, ...rest } = review;
  const reading = review.language === locale ? undefined : translations[locale];

  if (!reading) return { ...rest, translatedFrom: null };

  return { ...rest, text: reading, translatedFrom: review.language };
}

export function localizeAll(reviews: Review[], locale: Locale): LocalizedReview[] {
  return reviews.map((review) => localize(review, locale));
}

export const curationRules = curation;
