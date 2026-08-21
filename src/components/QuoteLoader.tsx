'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/**
 * The wait, while the database works the price out.
 *
 * Three sentences take turns, on shimmer text (15) so the words are alive
 * without a spinner, and each one arrives and leaves on mask reveal up from
 * the animate-text catalogue.
 *
 * They take turns strictly. The catalogue offers a crossfade with the two
 * lines overlapping, and that reads as two sentences to look at rather than
 * one thought changing, so the one leaving is gone before the next one starts
 * arriving. One element carries both states, which is what makes the sequence
 * exact: flipping it to the leaving state swaps the animation on the element
 * already there, and only once that has run does the next sentence mount.
 *
 * The rotation is decoration. A screen reader is told once what is happening
 * and is not made to sit through three phrasings of it, so the line is hidden
 * from the accessibility tree and a single quiet status carries the message.
 */

/**
 * How long a sentence owns the block, counted from the moment it starts
 * arriving. The catalogue's entry takes 760ms of it, which leaves the words
 * standing still for long enough to be read before they go.
 */
const HOLD_MS = 1250;
/** The exit of mask-reveal-up, run in full before the next sentence mounts. */
const OUT_MS = 520;

type Turn = { shown: number; leaving: boolean };

type Props = {
  /**
   * True once the price is in and the panel is about to take this place. The
   * block plays its exit and the caller unmounts it when that has run.
   */
  leaving: boolean;
};

export function QuoteLoader({ leaving }: Props) {
  const t = useTranslations('reservation.booking.quote.working');
  const messages = [t('price'), t('best'), t('dates')];
  const count = messages.length;

  const [turn, setTurn] = useState<Turn>({ shown: 0, leaving: false });

  useEffect(() => {
    // The whole block is on its way out: the sentence in it stays as it is
    // rather than starting a turn it will not finish.
    if (leaving) return;

    const timer = window.setTimeout(
      () =>
        setTurn((current) =>
          current.leaving
            ? { shown: (current.shown + 1) % count, leaving: false }
            : { ...current, leaving: true },
        ),
      turn.leaving ? OUT_MS : HOLD_MS,
    );

    return () => window.clearTimeout(timer);
  }, [leaving, count, turn]);

  return (
    <div className={`py-8 text-center ${leaving ? 'q-vanish' : ''}`}>
      <p className="q-stack font-display text-xl sm:text-2xl" aria-hidden="true">
        <span
          key={turn.shown}
          className="q-line"
          data-state={turn.leaving ? 'out' : 'in'}
        >
          <span className="t-shimmer" data-text={messages[turn.shown]}>
            {messages[turn.shown]}
          </span>
        </span>
      </p>

      <span className="visually-hidden" role="status">
        {messages[0]}
      </span>
    </div>
  );
}
