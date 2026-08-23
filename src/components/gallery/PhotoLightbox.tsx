'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ROOM_ORDER } from '@/lib/rooms';
import { fillTemplate, type GalleryLabels, type PhotoView } from './types';

/**
 * Matched geometry, the way iOS does it: the photo does not fade out here and
 * fade in there, it travels. Framer is given the shared `layoutId` and works
 * the path out itself, so nothing is driven by hand.
 *
 * The backdrop deliberately has no `layoutId`: it cross fades, it never zooms.
 */
const MORPH = { type: 'spring', stiffness: 300, damping: 30 } as const;

function Chevron({ flipped = false }: { flipped?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
      style={flipped ? { transform: 'rotate(180deg)' } : undefined}
    >
      <path
        d="M15 5l-7 7 7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PhotoLightbox({
  photos,
  index,
  labels,
  onGoTo,
  onClose,
}: {
  photos: PhotoView[];
  index: number;
  labels: GalleryLabels;
  onGoTo: (index: number) => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const current = photos[index];
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const lastSeen = useRef(current.id);
  lastSeen.current = current.id;

  const step = useCallback((direction: 1 | -1) => onGoTo(index + direction), [index, onGoTo]);

  // Focus goes into the dialog, stays there, and comes back to the tile that
  // opened it.
  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      const tile = document.getElementById(`gallery-tile-${lastSeen.current}`);
      (tile ?? restoreTo.current)?.focus();
    };
  }, []);

  // Scroll lock, restored exactly as it was found.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
        return;
      }
      if (event.key !== 'Tab') return;

      const card = cardRef.current;
      if (!card) return;
      const focusable = card.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  // The strip follows the photo, so the current thumbnail is always in sight.
  useEffect(() => {
    const strip = stripRef.current;
    const thumb = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !thumb) return;
    strip.scrollTo({
      left: thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2,
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, [index, reduce]);

  const counter = fillTemplate(labels.counter, {
    current: index + 1,
    total: photos.length,
  });

  const roomPhotos = photos.filter((photo) => photo.room === current.room);
  const roomCounter = fillTemplate(labels.roomCounter, {
    room: labels.rooms[current.room],
    current: roomPhotos.findIndex((photo) => photo.id === current.id) + 1,
    total: roomPhotos.length,
  });

  const fade = reduce ? { duration: 0 } : { duration: 0.22 };

  return (
    <motion.div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={current.alt}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={fade}
    >
      <button
        type="button"
        className="lightbox__backdrop"
        aria-label={labels.close}
        tabIndex={-1}
        onClick={onClose}
      />

      <div className="lightbox__card" ref={cardRef}>
        <div className="lightbox__head">
          <div>
            <p className="lightbox__room">{labels.rooms[current.room]}</p>
            <p className="lightbox__caption">{current.alt}</p>
          </div>
          <div className="lightbox__meta">
            <div className="lightbox__counts">
              <p className="lightbox__counter">{counter}</p>
              <p className="lightbox__roomcounter">{roomCounter}</p>
            </div>
            <button
              type="button"
              ref={closeRef}
              className="lightbox__close"
              aria-label={labels.close}
              onClick={onClose}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                <path
                  d="M5 5l14 14M19 5L5 19"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="lightbox__stage">
          {/*
            Only this box carries the shared layout id, so only the photo
            travels. Tile and box are both 4:3, so the scale is uniform and the
            cover crop does not jump.
          */}
          <motion.div
            layoutId={`photo-${current.id}`}
            className="lightbox__frame"
            transition={reduce ? { duration: 0 } : MORPH}
          >
            <AnimatePresence initial={false}>
              <motion.span
                key={current.src}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={fade}
                style={{ position: 'absolute', inset: 0 }}
              >
                <Image
                  src={current.src}
                  alt={current.alt}
                  fill
                  sizes="(min-width: 1024px) 70vw, 95vw"
                  className="lightbox__img"
                />
              </motion.span>
            </AnimatePresence>
          </motion.div>

          <button
            type="button"
            className="lightbox__nav lightbox__nav--prev"
            aria-label={labels.previous}
            onClick={() => step(-1)}
          >
            <Chevron />
          </button>
          <button
            type="button"
            className="lightbox__nav lightbox__nav--next"
            aria-label={labels.next}
            onClick={() => step(1)}
          >
            <Chevron flipped />
          </button>
        </div>

        <div className="lightbox__strip" ref={stripRef}>
          {photos.map((photo, position) => {
            const previous = photos[position - 1];
            const roomChanges =
              previous !== undefined &&
              ROOM_ORDER.indexOf(previous.room) !== ROOM_ORDER.indexOf(photo.room);

            return (
              <div key={photo.id} style={{ display: 'contents' }}>
                {roomChanges ? <span className="lightbox__sep" aria-hidden="true" /> : null}
                <button
                  type="button"
                  className="lightbox__thumb"
                  aria-current={position === index ? 'true' : undefined}
                  aria-label={photo.alt}
                  onClick={() => onGoTo(position)}
                >
                  {photo.available ? (
                    <Image src={photo.src} alt="" fill sizes="64px" />
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
