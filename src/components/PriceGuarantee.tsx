'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { PopNumber } from '@/components/PopNumber';

/**
 * The promise made over the call to action, and what happens when it runs out.
 *
 * A quote is a photograph of the rates as they were when it was asked for. It
 * is honoured for half an hour, said plainly on a notch pulled out from under
 * the button on the movement the WhatsApp notch uses, with the clock counting
 * down on number pop in (02) so the seconds are seen going rather than found
 * gone.
 *
 * When the half hour is up the price is not quietly left on screen to be paid
 * later: the dialog says the rate has moved on and the only way out of it is
 * to ask for a fresh one.
 */

/** Long enough to fill a form in, short enough that the rate is still true. */
export const GUARANTEE_MS = 30 * 60 * 1000;

/**
 * The quote is read first and the notch follows it. A movement that arrives
 * with everything else is not noticed, so it waits until the figures have been
 * looked at, the same reasoning that holds the WhatsApp notch back.
 */
const NOTCH_DELAY_MS = 2400;

/** Matches the closing duration in channel-dialog.css. */
const CLOSE_MS = 160;

/** mm:ss, with the minutes never dropping below two figures. */
export function clockFace(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function GuaranteeNotch({ label, clock }: { label: string; clock: string }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), NOTCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <span className="q-notch" data-shown={shown ? 'true' : undefined}>
      <span>{label}</span>
      {/* The clock is read as one value, so it is announced as one and not as
          a stream of digits arriving one after the other. */}
      <time aria-label={clock}>
        <PopNumber value={clock} stagger={false} />
      </time>
      <Icon name="alarm" className="h-[1.1em] w-auto shrink-0" />
    </span>
  );
}

/**
 * The rate has moved on, and the only offer is a fresh one.
 *
 * Every way out leads to the same place, on purpose: pressing escape or
 * clicking beside the card asks for a new price rather than putting the stale
 * one back on screen.
 */
export function QuoteExpiredDialog({ onRefresh }: { onRefresh: () => void }) {
  const t = useTranslations('reservation.booking.quote.expired');

  const [shown, setShown] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);

  /*
   * Held in a ref rather than watched as a dependency. The page is locked
   * against scrolling for as long as this dialog is up, and an effect that
   * re-ran on every render of the card would save the lock it had just put
   * there as the value to restore, leaving the page frozen behind it.
   */
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  // Mounted first, opened on the frame after, so the veil and the card have
  // somewhere to come from.
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') refresh.current();
    };
    document.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (shown) actionRef.current?.focus({ preventScroll: true });
  }, [shown]);

  function askAgain() {
    setShown(false);
    window.setTimeout(() => refresh.current(), CLOSE_MS);
  }

  const dialog = (
    <div
      className={`channel-veil ${shown ? 'is-open' : ''}`}
      onPointerDown={(event) => {
        if (!dialogRef.current?.contains(event.target as Node)) askAgain();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="quote-expired-title"
        aria-describedby="quote-expired-body"
        className="channel-dialog"
      >
        <h3 id="quote-expired-title" className="font-display text-xl">
          {t('title')}
        </h3>
        <p id="quote-expired-body" className="mt-2 text-sm text-ink-soft">
          {t('body')}
        </p>

        <button
          ref={actionRef}
          type="button"
          onClick={askAgain}
          className="btn btn-primary mt-6 w-full"
        >
          {t('action')}
        </button>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
