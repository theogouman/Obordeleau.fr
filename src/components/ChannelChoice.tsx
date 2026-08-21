'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChannelMark, type Brand } from '@/components/ChannelMark';
import { trackBookingIntent } from '@/lib/analytics';

/**
 * The two platforms, inside the booking card and under its own call to action.
 *
 * They are not hidden, because a guest who came from Airbnb should still find
 * the listing there. They are not free either: choosing one opens a dialog
 * that says plainly what the platform adds to the bill before the visitor
 * leaves, with the direct path offered first.
 *
 * The dialog is rendered into <body>, so the blur covers the whole page and no
 * ancestor with overflow can clip it, and it mounts closed and opens on the
 * frame after so the transition has a state to come from.
 */

/** Matches the closing duration in channel-dialog.css. */
const CLOSE_MS = 160;

type Props = {
  locale: string;
  airbnbUrl?: string;
  bookingUrl?: string;
  /** Where "book directly" puts the visitor back. */
  calendarId: string;
};

export function ChannelChoice({ locale, airbnbUrl, bookingUrl, calendarId }: Props) {
  const t = useTranslations('reservation.channels');
  const common = useTranslations('common');

  const [asked, setAsked] = useState<Brand | null>(null);
  const [shown, setShown] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const offers: Array<{ brand: Brand; url: string; name: string; hint: string }> = [];
  if (airbnbUrl) {
    offers.push({
      brand: 'airbnb',
      url: airbnbUrl,
      name: t('airbnbName'),
      hint: t('airbnb.external'),
    });
  }
  if (bookingUrl) {
    offers.push({
      brand: 'booking',
      url: bookingUrl,
      name: t('bookingName'),
      hint: t('booking.external'),
    });
  }

  const close = useCallback(() => {
    setShown(false);
    window.setTimeout(() => setAsked(null), CLOSE_MS);
    openerRef.current?.focus();
  }, []);

  function ask(brand: Brand, event: MouseEvent<HTMLButtonElement>) {
    openerRef.current = event.currentTarget;
    setAsked(brand);
  }

  // Mounted first, opened on the frame after, so the veil and the card have
  // somewhere to come from.
  useEffect(() => {
    if (!asked) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [asked]);

  useEffect(() => {
    if (!asked) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);

    // The page underneath must not scroll away behind the blur.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [asked, close]);

  useEffect(() => {
    if (shown) closeRef.current?.focus({ preventScroll: true });
  }, [shown]);

  function bookDirectly() {
    close();
    // After the dialog has gone, so the scroll is not fighting the blur.
    window.setTimeout(() => {
      const calendar = document.getElementById(calendarId);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      calendar?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    }, CLOSE_MS);
  }

  if (offers.length === 0) return null;

  const current = offers.find((offer) => offer.brand === asked);

  const dialog =
    asked && current ? (
      <div
        className={`channel-veil ${shown ? 'is-open' : ''}`}
        onPointerDown={(event) => {
          if (!dialogRef.current?.contains(event.target as Node)) close();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-dialog-title"
          className="channel-dialog"
        >
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label={common('close')}
            className="channel-dialog__close"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <ChannelMark brand={current.brand} className="channel-dialog__mark" />

          <h3 id="channel-dialog-title" className="mt-4 font-display text-xl">
            {t('dialog.title')}
          </h3>
          <p className="mt-2 text-sm text-ink-soft">
            {t('dialog.body', { channel: current.name })}
          </p>

          <button type="button" onClick={bookDirectly} className="btn btn-primary mt-6 w-full">
            {t('dialog.direct')}
          </button>

          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              trackBookingIntent(current.brand, locale);
              close();
            }}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-sm text-ink-soft underline underline-offset-4 transition-colors hover:text-ink"
          >
            {t('dialog.external', { channel: current.name })}
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
              <path
                d="M6 3h7v7M13 3L4 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="visually-hidden">{current.hint}</span>
          </a>
        </div>
      </div>
    ) : null;

  return (
    <div className="border-t border-[rgba(58,42,38,0.12)] pt-5">
      <p className="text-center text-xs uppercase tracking-[0.14em] text-ink-soft">{t('alsoOn')}</p>

      <div className={`mt-3 grid gap-3 ${offers.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {offers.map((offer) => (
          <button
            key={offer.brand}
            type="button"
            onClick={(event) => ask(offer.brand, event)}
            className="btn btn-secondary w-full px-3 py-2.5 text-sm"
          >
            {t('bookOn', { channel: offer.name })}
            <ChannelMark brand={offer.brand} className="h-[1.15em] w-auto" />
          </button>
        ))}
      </div>

      {dialog ? createPortal(dialog, document.body) : null}
    </div>
  );
}
