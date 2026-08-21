'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { ReviewSource } from '@/lib/reviews';

/** Matches --morph-close-dur: the choice lands once the panel has closed. */
const CLOSE_MS = 250;

const LOGOS: Record<ReviewSource, string> = {
  airbnb: '/images/annexes/airbnb-icon.svg',
  booking: '/images/annexes/booking-icon.svg',
};

export type SourceMenuLabels = {
  from: string;
  or: string;
  platformMenu: string;
  platformOpen: string;
  airbnb: string;
  booking: string;
  clear: string;
};

type Props = {
  value: ReviewSource | null;
  onChange: (value: ReviewSource | null) => void;
  labels: SourceMenuLabels;
};

function Logo({ source, size = 18 }: { source: ReviewSource; size?: number }) {
  return (
    <Image
      src={LOGOS[source]}
      alt=""
      width={size}
      height={size}
      unoptimized
      className="shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * The platform chip, on transitions.dev plus to menu morph (20): the chip does
 * not open a panel beside itself, it becomes the panel. The box grows out of
 * the corner the trigger is pinned to, its radius relaxes, the closed label
 * slides out and the choices slide in.
 *
 * Choosing plays the close first and applies the filter after it, so the panel
 * folding away and the wall reordering are two movements in a row rather than
 * one on top of the other.
 */
export function ReviewsSourceMenu({ value, onChange, labels }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  function choose(next: ReviewSource | null) {
    setOpen(false);
    triggerRef.current?.focus();

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      onChange(next);
      return;
    }

    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onChange(next), CLOSE_MS);
  }

  return (
    <div className="reviews-source" ref={rootRef}>
      <div className="t-morph reviews-source__morph" data-open={open ? 'true' : 'false'}>
        <div className="t-morph-menu reviews-source__menu" role="menu" aria-label={labels.platformMenu}>
          <p className="reviews-source__title">{labels.platformMenu}</p>

          {(['airbnb', 'booking'] as const).map((source) => (
            <button
              key={source}
              type="button"
              role="menuitemradio"
              aria-checked={value === source}
              tabIndex={open ? 0 : -1}
              className="reviews-source__option"
              onClick={() => choose(source)}
            >
              <Logo source={source} size={20} />
              <span>{labels[source]}</span>
            </button>
          ))}

          <button
            type="button"
            role="menuitemradio"
            aria-checked={value === null}
            tabIndex={open ? 0 : -1}
            className="reviews-source__option reviews-source__option--plain"
            onClick={() => choose(null)}
          >
            {labels.clear}
          </button>
        </div>

        {/* The visible label of the closed chip is two words around two logos,
            so the name it carries has to spell the logos out. It still opens
            with the words that are on screen, which is what label in name
            asks for. */}
        <button
          ref={triggerRef}
          type="button"
          className="t-morph-plus reviews-source__trigger"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={
            value ? `${labels.platformMenu}: ${labels[value]}` : `${labels.from} ${labels.airbnb} ${labels.or} ${labels.booking}`
          }
          title={labels.platformOpen}
          data-active={value ? 'true' : undefined}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
        >
          {value ? (
            <>
              <Logo source={value} />
              <span>{labels[value]}</span>
            </>
          ) : (
            <>
              <span>{labels.from}</span>
              <Logo source="airbnb" />
              <span>{labels.or}</span>
              <Logo source="booking" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
