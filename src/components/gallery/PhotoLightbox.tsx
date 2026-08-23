'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef } from 'react';
import { ROOM_ORDER } from '@/lib/rooms';
import { fillTemplate, type GalleryLabels, type PhotoView } from './types';
import { usePrefersReducedMotion } from './use-reduced-motion';

/**
 * Matched geometry, the way iOS does it: the photo does not fade out here and
 * fade in there, it travels. The tile's box is read at the moment of opening
 * and the large image is animated from it, so a photo grows out of its own
 * place in the grid and shrinks back into it.
 *
 * The chrome around it, backdrop, surface, caption and strip, only ever cross
 * fades. Nothing but the photograph moves.
 */
const OPEN_MS = 380;
const CLOSE_MS = 320;
const OPEN_EASE = 'cubic-bezier(0.22,1,0.36,1)';
const CLOSE_EASE = 'cubic-bezier(0.5,0,0.75,0)';
/** Long enough for the cross fade when there is no photo to travel back to. */
const FADE_OUT_MS = 120;
/** Radius of the tile, and radius of the viewer: the morph goes from one to the other. */
const TILE_RADIUS = '16px';
const MEDIA_RADIUS = '14px';

function tileImage(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#gallery-tile-${id} img`);
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
  const reduce = usePrefersReducedMotion();
  const current = photos[index];

  const overlayRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const restoreTo = useRef<HTMLElement | null>(null);
  /** The tile the photo came out of, hidden while its photo is elsewhere. */
  const hiddenTile = useRef<HTMLElement | null>(null);
  const morph = useRef<Animation | null>(null);
  const closing = useRef(false);
  const seen = useRef(current.id);
  seen.current = current.id;

  const photo = useCallback(() => mediaRef.current?.querySelector<HTMLElement>('img') ?? null, []);

  const step = useCallback((direction: 1 | -1) => onGoTo(index + direction), [index, onGoTo]);

  /** The photo travels back into its tile, and only then does the viewer go. */
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;

    const image = photo();
    if (morph.current) {
      morph.current.cancel();
      morph.current = null;
    }
    if (image) image.style.transform = '';

    const done = () => {
      if (hiddenTile.current) {
        hiddenTile.current.style.visibility = '';
        hiddenTile.current = null;
      }
      onClose();
    };

    overlayRef.current?.removeAttribute('data-shown');

    const tile = tileImage(seen.current);
    if (reduce || !tile || !image) {
      window.setTimeout(done, FADE_OUT_MS);
      return;
    }

    const from = image.getBoundingClientRect();
    const to = tile.getBoundingClientRect();
    if (hiddenTile.current && hiddenTile.current !== tile) hiddenTile.current.style.visibility = '';
    tile.style.visibility = 'hidden';
    hiddenTile.current = tile;

    image.style.transformOrigin = 'top left';
    const back = image.animate(
      [
        { transform: 'translate(0,0) scale(1,1)', borderRadius: MEDIA_RADIUS },
        {
          transform: `translate(${to.left - from.left}px,${to.top - from.top}px) scale(${to.width / from.width},${to.height / from.height})`,
          borderRadius: TILE_RADIUS,
        },
      ],
      { duration: CLOSE_MS, easing: CLOSE_EASE },
    );
    back.onfinish = done;
    back.oncancel = done;
  }, [onClose, photo, reduce]);

  // The photo grows out of its tile. Read after the first paint, so the boxes
  // measured are the ones on screen.
  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;

    const tile = tileImage(seen.current);
    const rect = tile?.getBoundingClientRect() ?? null;

    const frame = requestAnimationFrame(() => {
      overlayRef.current?.setAttribute('data-shown', 'true');
      closeRef.current?.focus();

      const image = photo();
      if (reduce || !rect || !image) return;

      const from = image.getBoundingClientRect();
      if (tile) {
        tile.style.visibility = 'hidden';
        hiddenTile.current = tile;
      }

      image.style.transformOrigin = 'top left';
      morph.current = image.animate(
        [
          {
            transform: `translate(${rect.left - from.left}px,${rect.top - from.top}px) scale(${rect.width / from.width},${rect.height / from.height})`,
            borderRadius: TILE_RADIUS,
          },
          { transform: 'translate(0,0) scale(1,1)', borderRadius: MEDIA_RADIUS },
        ],
        { duration: OPEN_MS, easing: OPEN_EASE },
      );
      morph.current.onfinish = () => {
        image.style.transform = '';
        morph.current = null;
      };
    });

    return () => {
      cancelAnimationFrame(frame);
      if (hiddenTile.current) {
        hiddenTile.current.style.visibility = '';
        hiddenTile.current = null;
      }
      const tileBack = tileImage(seen.current);
      (tileBack?.closest<HTMLElement>('button') ?? restoreTo.current)?.focus();
    };
  }, [photo, reduce]);

  // Scroll lock, restored exactly as it was found.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // One photo replacing another is a cross fade in place, never a second morph.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const image = photo();
    if (!image || reduce) return;
    image.style.transform = '';
    image.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  }, [index, photo, reduce]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
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

      const overlay = overlayRef.current;
      if (!overlay) return;
      const focusable = overlay.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const start = focusable[0];
      const end = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === start) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        start.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, step]);

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

  const counter = fillTemplate(labels.counter, { current: index + 1, total: photos.length });
  const roomPhotos = photos.filter((item) => item.room === current.room);
  const roomCounter = fillTemplate(labels.roomCounter, {
    room: labels.rooms[current.room],
    current: roomPhotos.findIndex((item) => item.id === current.id) + 1,
    total: roomPhotos.length,
  });

  return (
    <div
      className="lightbox"
      ref={overlayRef}
      onMouseDown={(event) => {
        if (!frameRef.current?.contains(event.target as Node)) close();
      }}
    >
      <div className="lightbox__backdrop" aria-hidden="true" />

      <div
        className="lightbox__frame"
        ref={frameRef}
        role="dialog"
        aria-modal="true"
        aria-label={current.alt}
      >
        <div className="lightbox__surface" aria-hidden="true" />

        <div className="lightbox__top">
          <p className="lightbox__title">
            <span className="lightbox__room">{labels.rooms[current.room]}</span>
            <span className="lightbox__alt">{current.alt}</span>
          </p>
          <span className="lightbox__count">
            {counter}
            <span className="lightbox__roomcount">{roomCounter}</span>
          </span>
        </div>

        <div className="lightbox__media" ref={mediaRef}>
          <button
            type="button"
            className="lightbox__nav lightbox__nav--prev"
            aria-label={labels.previous}
            onClick={() => step(-1)}
          >
            <span aria-hidden="true">&#8249;</span>
          </button>
          <Image
            src={current.src}
            alt={current.alt}
            fill
            sizes="(min-width: 1024px) 58rem, 94vw"
            className="lightbox__img"
            priority
          />
          <button
            type="button"
            className="lightbox__nav lightbox__nav--next"
            aria-label={labels.next}
            onClick={() => step(1)}
          >
            <span aria-hidden="true">&#8250;</span>
          </button>
        </div>

        <div className="lightbox__bottom">
          <div className="lightbox__strip" ref={stripRef}>
            {photos.map((item, position) => {
              const previous = photos[position - 1];
              const roomChanges =
                previous !== undefined &&
                ROOM_ORDER.indexOf(previous.room) !== ROOM_ORDER.indexOf(item.room);

              return (
                <div key={item.id} style={{ display: 'contents' }}>
                  {roomChanges ? <span className="lightbox__sep" aria-hidden="true" /> : null}
                  <button
                    type="button"
                    className="lightbox__thumb"
                    aria-current={position === index ? 'true' : undefined}
                    aria-label={item.alt}
                    title={labels.rooms[item.room]}
                    onClick={() => onGoTo(position)}
                  >
                    {item.available ? <Image src={item.src} alt="" fill sizes="70px" /> : null}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="lightbox__close"
        ref={closeRef}
        aria-label={labels.close}
        onClick={close}
      >
        <span aria-hidden="true">&#10005;</span>
      </button>
    </div>
  );
}
