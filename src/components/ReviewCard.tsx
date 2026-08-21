'use client';

import Image from 'next/image';
import { useLocale } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Stars } from '@/components/Stars';
import { localeTags, type Locale } from '@/i18n/routing';
import type { Review } from '@/lib/reviews';

export type ReviewCardLabels = {
  ratingAria: string;
  readMore: string;
  readLess: string;
  originalLanguage: string;
  languageNames: Record<string, string>;
  /** {name} {rating} {source} {month}, the sentence the header carries. */
  stayTooltip: string;
  sourceNames: Record<string, string>;
};

type Props = {
  review: Review;
  labels: ReviewCardLabels;
  /** Reviews longer than this get the accordion toggle. */
  clampThreshold?: number;
  /**
   * The home page row, where the last cards are cut in half. The text stays
   * clamped and the toggle is dropped: a control nobody can see is a control
   * the keyboard should not be able to reach either.
   */
  teaser?: boolean;
};

const LOCALE_TAGS: Record<string, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  de: 'de-DE',
  other: 'fr-FR',
};

/** The month of the stay, in the language of the page rather than of the export. */
function stayMonth(dateIso: string, fallback: string, tag: string): string {
  if (!dateIso) return fallback;
  const date = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    date,
  );
}

export function ReviewCard({ review, labels, clampThreshold = 260, teaser = false }: Props) {
  const locale = useLocale() as Locale;
  const [expanded, setExpanded] = useState(false);
  const textId = useId();
  const long = review.text.length > clampThreshold;
  const clamped = long && (teaser || !expanded);

  /*
   * Opening a review used to stretch the whole grid row at once, because every
   * card in a row shares its height. The row no longer stretches its cards
   * (the grid aligns them to their own top), and the card that was opened
   * grows on its own, on transitions.dev card resize (01): the height is
   * pinned to what it is, the clamp flips, the new height is measured on the
   * next frame, and the tween runs between the two. Once it has arrived the
   * height goes back to auto, so a window resize or a font swap still reflows
   * the card normally.
   */
  const textRef = useRef<HTMLParagraphElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  function toggle() {
    const text = textRef.current;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!text || reduced) {
      setExpanded((value) => !value);
      return;
    }

    setHeight(text.offsetHeight);
    setExpanded((value) => !value);
  }

  // The clamp has flipped by now, so the paragraph can be measured in its new
  // state. Measuring the paragraph and not the frame matters: the frame still
  // carries the height it is leaving.
  useEffect(() => {
    if (height === null) return;
    const text = textRef.current;
    if (!text) return;

    const frame = requestAnimationFrame(() => setHeight(text.offsetHeight));
    return () => cancelAnimationFrame(frame);
    // Only when the answer changes, never when the height it is tweening does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const languageName = labels.languageNames[review.language] ?? labels.languageNames.other;

  /*
   * The whole header is one hover target, because the name, the face, the date
   * and the stars are four halves of the same sentence: who wrote it, where,
   * and when they stayed. The tooltip opens below and not above, so it stays
   * inside the card whatever row the card is on.
   */
  const pageTag = localeTags[locale] ?? 'fr-FR';
  const tooltip = labels.stayTooltip
    .replace('{name}', review.firstName)
    .replace('{rating}', review.rating.toLocaleString(pageTag))
    .replace('{source}', labels.sourceNames[review.source] ?? review.source)
    .replace('{month}', stayMonth(review.dateIso, review.dateLabel, pageTag));

  // The marker only earns its place when the review is not in the language the
  // visitor is already reading. On the French page, "FR" on a French review
  // says nothing.
  const showLanguage = review.language !== 'other' && review.language !== locale;

  return (
    <article className="card flex h-full flex-col p-5">
      <header className="t-tt-wrap review-tip-wrap flex items-center gap-3">
        {review.avatar ? (
          <Image
            src={review.avatar}
            alt=""
            width={44}
            height={44}
            loading="lazy"
            className="size-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sand font-display text-sm text-ink-soft"
          >
            {review.initials}
          </span>
        )}

        <div className="min-w-0">
          <p className="truncate font-medium">{review.firstName}</p>
          {review.dateLabel ? (
            <p className="text-sm text-ink-soft">
              <time dateTime={review.dateIso || undefined}>{review.dateLabel}</time>
            </p>
          ) : null}
        </div>

        <Stars
          rating={review.rating}
          label={labels.ratingAria.replace('{rating}', String(review.rating))}
          className="ms-auto shrink-0"
        />

        {/* Pointer only: the same sentence is in the accessibility tree just
            below, where a screen reader reads it in the order of the card. */}
        <span className="t-tt review-tip" role="tooltip" aria-hidden="true">
          {tooltip}
        </span>
        <span className="visually-hidden">{tooltip}</span>
      </header>

      <div
        className="t-resize mt-4 grow overflow-hidden"
        style={height === null ? undefined : { height: `${height}px` }}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'height') setHeight(null);
        }}
      >
        <p
          ref={textRef}
          id={textId}
          lang={review.language === 'other' ? undefined : review.language}
          className={clamped ? 'clamp-lines' : undefined}
          style={clamped ? { WebkitLineClamp: 5 } : undefined}
        >
          {review.text}
        </p>
      </div>

      <footer className="mt-4 flex items-center justify-between gap-3 text-sm">
        {long && !teaser ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            aria-controls={textId}
            className="font-medium text-raspberry-ink underline underline-offset-4"
          >
            {expanded ? labels.readLess : labels.readMore}
          </button>
        ) : (
          <span />
        )}

        {showLanguage ? (
          <span
            className="text-ink-soft"
            title={labels.originalLanguage.replace('{language}', languageName)}
          >
            <span className="visually-hidden">
              {labels.originalLanguage.replace('{language}', languageName)}
            </span>
            <span aria-hidden="true" lang={LOCALE_TAGS[review.language]}>
              {review.language.toUpperCase()}
            </span>
          </span>
        ) : null}
      </footer>
    </article>
  );
}
