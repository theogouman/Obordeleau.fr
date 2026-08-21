'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
import { Stars } from '@/components/Stars';
import type { Review } from '@/lib/reviews';

export type ReviewCardLabels = {
  ratingAria: string;
  readMore: string;
  readLess: string;
  originalLanguage: string;
  languageNames: Record<string, string>;
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

export function ReviewCard({ review, labels, clampThreshold = 260, teaser = false }: Props) {
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

  return (
    <article className="card flex h-full flex-col p-5">
      <header className="flex items-center gap-3">
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

        <span className="text-ink-soft" title={labels.originalLanguage.replace('{language}', languageName)}>
          <span className="visually-hidden">
            {labels.originalLanguage.replace('{language}', languageName)}
          </span>
          <span aria-hidden="true" lang={LOCALE_TAGS[review.language]}>
            {review.language === 'other' ? '' : review.language.toUpperCase()}
          </span>
        </span>
      </footer>
    </article>
  );
}
