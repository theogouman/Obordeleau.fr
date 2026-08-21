import curation from '@content/reviews-curation.json';
import rawReviews from '@content/reviews.json';

/**
 * Reviews are a one-time export owned by content/reviews.json. Rules come from
 * specs/001-obordeleau-site/reviews-curation.md:
 *  - display the first name only (constitution VI, data minimisation)
 *  - keep the original language, never machine retranslate (FR-007)
 *  - avatars served locally (FR-010), initials fallback when absent
 */

export type ReviewLanguage = 'fr' | 'en' | 'de' | 'other';

type RawReview = {
  id?: string | number;
  reviewer_name?: string;
  rating?: number | string;
  date?: string;
  date_iso?: string;
  review_fr?: string;
  text?: string;
  lang?: string;
  image_filename?: string;
  has_custom_photo?: boolean;
};

export type Review = {
  id: string;
  firstName: string;
  initials: string;
  rating: number;
  dateLabel: string;
  dateIso: string;
  text: string;
  language: ReviewLanguage;
  avatar: string | null;
};

const GERMAN_MARKERS =
  /\b(und|sehr|wir|war|ist|nicht|sehr|wohnung|strand|schön|gemütlich|alles|gut|die|der|das|zu fuß|klein|sauber)\b/gi;
const ENGLISH_MARKERS =
  /\b(the|and|was|were|very|beach|apartment|studio|clean|great|walk|stay|we|nice|would|everything)\b/gi;
const FRENCH_MARKERS =
  /\b(et|le|la|les|nous|très|tres|plage|studio|propre|séjour|sejour|bien|accueil|tout|est|à pied|a pied)\b/gi;

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

  return {
    id,
    firstName: firstNameOf(fullName) || id,
    initials: initialsOf(fullName),
    rating: Number.isFinite(rating) ? Math.min(5, Math.max(1, rating)) : 5,
    dateLabel: (raw.date ?? raw.date_iso ?? '').trim(),
    dateIso: (raw.date_iso ?? '').trim(),
    text,
    language:
      declared && ['fr', 'en', 'de', 'other'].includes(declared) ? declared : detectLanguage(text),
    avatar: hasPhoto ? `/images/reviews/${raw.image_filename}` : null,
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

export const averageRating = Math.round(averageRatingExact * 10) / 10;

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

export const curationRules = curation;
