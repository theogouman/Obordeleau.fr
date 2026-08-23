'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

type Props = {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  /** Shown, with the alt text behind it, once the retries are spent. */
  missingLabel: string;
};

/**
 * A photograph that does not give up on the first refusal.
 *
 * An <img> that fails paints its alt text, and it never tries again: the
 * browser remembers the failure against that exact URL, so a hiccup at the one
 * moment the picture was asked for is permanent for the rest of the visit.
 * That is what was happening to the beach card, and only sometimes, which is
 * the signature of it. The file is on disk, `/images/area/sablettes-plage.jpg`
 * answers 200, and so does every variant the optimizer makes of it: I asked for
 * each of them cold and warm, as AVIF and as JPEG, on a phone viewport and a
 * desktop one, and they all came back. So there is nothing here to repair at
 * the source, and the honest fix is to stop a single lost request from being
 * the last word.
 *
 * Failing twice in a row is treated as a real absence rather than as bad luck,
 * and the card then shows the reserved frame the rest of the site uses for a
 * photograph it does not have, with the alt text kept for anyone reading the
 * page rather than looking at it. A broken picture icon is never the answer.
 *
 * The retry carries a counter into the source URL, because a URL the browser
 * has already failed on is a URL it will not fetch again.
 */

/** Two goes after the first, which is enough for a hiccup and short of a loop. */
const ATTEMPTS = 2;
/** Long enough for a stalled connection to have moved on. */
const BACKOFF_MS = 700;

export function ResilientImage({ src, alt, sizes, className = '', missingLabel }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (gaveUp) {
    return (
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-sand p-4 text-center ${className}`}
      >
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
          <path
            d="M3 6h18v12H3z M3 15l5-5 4 4 3-3 6 6"
            fill="none"
            stroke="var(--color-ink-soft)"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-sm text-ink-soft">{missingLabel}</span>
        <span className="visually-hidden">{alt}</span>
      </div>
    );
  }

  return (
    <Image
      // The key is what makes a retry a new element rather than a new attribute
      // on an element the browser has already written off.
      key={attempt}
      src={attempt === 0 ? src : `${src}?retry=${attempt}`}
      alt={alt}
      fill
      sizes={sizes}
      className={`object-cover ${className}`}
      onError={() => {
        if (attempt >= ATTEMPTS) {
          setGaveUp(true);
          return;
        }
        const next = attempt + 1;
        timer.current = window.setTimeout(() => setAttempt(next), BACKOFF_MS * next);
      }}
    />
  );
}
