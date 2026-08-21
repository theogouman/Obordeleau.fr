'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/**
 * The wait, while the database works the price out.
 *
 * Three sentences take turns, on shimmer text (15) so the words are alive
 * without a spinner, and each one arrives and leaves on mask reveal up from
 * the animate-text catalogue: the sentence going lifts and blurs away while
 * the one coming rises into the same place, the two crossing for as long as
 * the catalogue says they should.
 *
 * The rotation is decoration. A screen reader is told once what is happening
 * and is not made to sit through three phrasings of it, so the stack is hidden
 * from the accessibility tree and a single quiet line carries the status.
 */

/** Long enough for a sentence to be read, short enough not to be a wait. */
const HOLD_MS = 1100;
/** The exit of mask-reveal-up, so a line is gone before it is unmounted. */
const OUT_MS = 520;

type Turn = { shown: number; previous: number | null };

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

  const [turn, setTurn] = useState<Turn>({ shown: 0, previous: null });

  useEffect(() => {
    if (leaving) return;

    const rotate = window.setInterval(
      () => setTurn((current) => ({ shown: (current.shown + 1) % count, previous: current.shown })),
      HOLD_MS,
    );

    return () => window.clearInterval(rotate);
  }, [leaving, count]);

  // The line that has left is dropped once its exit has run, so at most two
  // are ever mounted and the block never grows a stack of ghosts.
  useEffect(() => {
    if (turn.previous === null) return;

    const drop = window.setTimeout(
      () => setTurn((current) => ({ ...current, previous: null })),
      OUT_MS,
    );

    return () => window.clearTimeout(drop);
  }, [turn.previous]);

  return (
    <div className={`py-8 text-center ${leaving ? 'q-vanish' : ''}`}>
      <p className="q-stack font-display text-xl sm:text-2xl" aria-hidden="true">
        {turn.previous !== null ? (
          <span key={`out-${turn.previous}`} className="q-line" data-state="out">
            <span className="t-shimmer" data-text={messages[turn.previous]}>
              {messages[turn.previous]}
            </span>
          </span>
        ) : null}

        <span key={`in-${turn.shown}`} className="q-line" data-state="in">
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
