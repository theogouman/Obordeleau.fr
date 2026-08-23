'use client';

import Image from 'next/image';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { ROOM_ORDER } from '@/lib/rooms';
import { fillTemplate, type GalleryLabels, type PhotoView } from './types';
import { usePrefersReducedMotion } from './use-reduced-motion';

/**
 * Matched geometry, the way iOS does it: the viewer does not appear, it grows
 * out of the tile that was clicked and shrinks back into it.
 *
 * What travels is the whole card, not the photograph alone. Animating the
 * photograph inside its own frame meant animating it inside a box that clips,
 * so the picture slid out from under a black rectangle that stayed put. The
 * card carries its header, its picture and its strip along with it.
 *
 * Every step here is a Web Animations call rather than a CSS transition.
 * A transition needs its starting state to have been painted at least once,
 * and on a cold visit, with the main thread busy, that first paint is not
 * guaranteed to happen before the class flips: the viewer then appeared with
 * no animation at all. An animation is told both ends and owes nothing to
 * what was painted before.
 */
const OPEN_MS = 380;
const CLOSE_MS = 320;
const OPEN_EASE = 'cubic-bezier(0.22,1,0.36,1)';
const CLOSE_EASE = 'cubic-bezier(0.5,0,0.75,0)';
const BACKDROP_MS = 400;

function tileImage(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#gallery-tile-${id} img`);
}

/**
 * The strip holds twenty thumbnails and does not change when the photo does,
 * so it is kept out of the re-render and its current mark is moved by hand.
 */
const Strip = memo(function Strip({
  photos,
  labels,
  onGoTo,
}: {
  photos: PhotoView[];
  labels: GalleryLabels;
  onGoTo: (index: number) => void;
}) {
  return (
    <>
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
              data-position={position}
              aria-label={item.alt}
              title={labels.rooms[item.room]}
              onClick={() => onGoTo(position)}
            >
              {item.available ? <Image src={item.src} alt="" fill sizes="70px" /> : null}
            </button>
          </div>
        );
      })}
    </>
  );
});

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
  const backdropRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const restoreTo = useRef<HTMLElement | null>(null);
  /** The tile the viewer came out of, hidden while its photo is elsewhere. */
  const hiddenTile = useRef<HTMLElement | null>(null);
  const morph = useRef<Animation | null>(null);
  const closing = useRef(false);
  const seen = useRef(current.id);
  seen.current = current.id;

  const step = useCallback((direction: 1 | -1) => onGoTo(index + direction), [index, onGoTo]);

  /**
   * The photo on screen, and the two it sits between, all three mounted.
   *
   * Keeping the neighbours in the document is what makes an arrow press
   * immediate: the next photograph is already fetched and already decoded, so
   * the press swaps two opacities instead of starting a download.
   */
  const around = useMemo(() => {
    const total = photos.length;
    const wanted = [(index - 1 + total) % total, index, (index + 1) % total];
    return [...new Set(wanted)].map((position) => photos[position]);
  }, [index, photos]);

  /** Places the card exactly over its tile, as a transform. */
  const overTile = useCallback((tile: DOMRect, frame: DOMRect) => {
    const sx = tile.width / frame.width;
    const sy = tile.height / frame.height;
    return `translate(${tile.left - frame.left}px,${tile.top - frame.top}px) scale(${sx},${sy})`;
  }, []);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;

    const frame = frameRef.current;
    const backdrop = backdropRef.current;
    morph.current?.cancel();
    morph.current = null;

    const done = () => {
      if (hiddenTile.current) {
        hiddenTile.current.style.visibility = '';
        hiddenTile.current = null;
      }
      onClose();
    };

    const tile = tileImage(seen.current);
    if (reduce || !tile || !frame) {
      backdrop?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
      window.setTimeout(done, reduce ? 0 : 120);
      return;
    }

    const to = tile.getBoundingClientRect();
    const from = frame.getBoundingClientRect();
    if (hiddenTile.current && hiddenTile.current !== tile) hiddenTile.current.style.visibility = '';
    tile.style.visibility = 'hidden';
    hiddenTile.current = tile;

    backdrop?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: CLOSE_MS,
      easing: CLOSE_EASE,
      fill: 'forwards',
    });

    const back = frame.animate(
      [
        { transform: 'translate(0,0) scale(1,1)', opacity: 1 },
        { transform: overTile(to, from), opacity: 0, offset: 1 },
      ],
      { duration: CLOSE_MS, easing: CLOSE_EASE, fill: 'forwards' },
    );
    back.onfinish = done;
    back.oncancel = done;
  }, [onClose, overTile, reduce]);

  // The card grows out of its tile. The tile is measured before the viewer is
  // painted, so the box read is the one that is on screen.
  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;

    const tile = tileImage(seen.current);
    const to = tile?.getBoundingClientRect() ?? null;
    const frame = frameRef.current;
    const backdrop = backdropRef.current;

    /*
     * Anything still running is cancelled before the card is measured.
     *
     * Without this the effect running a second time, which is what React does
     * in development and what a remount does anywhere, read the card while the
     * first animation already had it shrunk onto the tile. The travel computed
     * from that box went from the tile to the tile, so the second animation,
     * the one that wins, moved nothing and the viewer appeared flat.
     */
    morph.current?.cancel();
    morph.current = null;

    closeRef.current?.focus({ preventScroll: true });

    backdrop?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: reduce ? 0 : BACKDROP_MS,
      easing: OPEN_EASE,
      fill: 'forwards',
    });

    if (!reduce && to && frame) {
      const from = frame.getBoundingClientRect();
      tile!.style.visibility = 'hidden';
      hiddenTile.current = tile!;

      morph.current = frame.animate(
        [
          { transform: overTile(to, from), opacity: 0 },
          { transform: 'translate(0,0) scale(1,1)', opacity: 1 },
        ],
        { duration: OPEN_MS, easing: OPEN_EASE },
      );
      morph.current.onfinish = () => {
        morph.current = null;
      };
    }

    return () => {
      morph.current?.cancel();
      morph.current = null;
      if (hiddenTile.current) {
        hiddenTile.current.style.visibility = '';
        hiddenTile.current = null;
      }
      const tileBack = tileImage(seen.current);
      (tileBack?.closest<HTMLElement>('button') ?? restoreTo.current)?.focus({
        preventScroll: true,
      });
    };
  }, [overTile, reduce]);

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

  // The strip's current mark and its scroll are moved on the nodes themselves,
  // so walking the gallery never re-renders twenty thumbnails.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    strip.querySelector('[aria-current="true"]')?.removeAttribute('aria-current');
    const thumb = strip.querySelector<HTMLElement>(`[data-position="${index}"]`);
    if (!thumb) return;
    thumb.setAttribute('aria-current', 'true');
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
      <div className="lightbox__backdrop" ref={backdropRef} aria-hidden="true" />

      <div
        className="lightbox__frame"
        ref={frameRef}
        role="dialog"
        aria-modal="true"
        aria-label={current.alt}
      >
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

        <div className="lightbox__media">
          {around.map((item) => (
            <span
              key={item.id}
              className="lightbox__slide"
              data-current={item.id === current.id ? 'true' : undefined}
              aria-hidden={item.id === current.id ? undefined : 'true'}
            >
              <Image
                src={item.src}
                alt={item.id === current.id ? current.alt : ''}
                fill
                sizes="(min-width: 1024px) 58rem, 94vw"
                className="lightbox__img"
                priority={item.id === current.id}
                loading={item.id === current.id ? undefined : 'eager'}
              />
            </span>
          ))}

          <button
            type="button"
            className="lightbox__nav lightbox__nav--prev"
            aria-label={labels.previous}
            onClick={() => step(-1)}
          >
            <span aria-hidden="true">&#8249;</span>
          </button>
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
            <Strip photos={photos} labels={labels} onGoTo={onGoTo} />
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
