'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { ROOM_ORDER, type RoomId } from '@/lib/rooms';
import { GalleryPanel } from './GalleryPanel';
import { SPRING, SPRING_EPSILON, SURFACE_H, surfacePath } from './liquid-path';
import { usePrefersReducedMotion } from './use-reduced-motion';
import type { GalleryLabels, PhotoView } from './types';

const PhotoLightbox = dynamic(() => import('./PhotoLightbox').then((m) => m.PhotoLightbox), {
  ssr: false,
});

const ROOM_ICON: Record<RoomId, IconName> = {
  living: 'roomLiving',
  kitchen: 'roomKitchen',
  bed: 'roomBed',
  bath: 'roomBath',
  overview: 'roomOverview',
};

export function GalleryTabs({ photos, labels }: { photos: PhotoView[]; labels: GalleryLabels }) {
  const reduce = usePrefersReducedMotion();

  const [active, setActive] = useState<RoomId>(ROOM_ORDER[0]);
  const [open, setOpen] = useState<number | null>(null);
  /**
   * Everything is shown until this flips, which is what makes the first client
   * render match the server one and the page work with JavaScript off.
   */
  const [interactive, setInteractive] = useState(false);
  /** Frame width, in the surface's own coordinates. Zero until measured. */
  const [frameW, setFrameW] = useState(0);

  const byRoom = useMemo(() => {
    const map = new Map<RoomId, PhotoView[]>();
    for (const room of ROOM_ORDER) map.set(room, []);
    for (const photo of photos) map.get(photo.room)?.push(photo);
    return map;
  }, [photos]);

  const activeIndex = ROOM_ORDER.indexOf(active);

  const frameRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;

  // Geometry and spring, kept out of React state: the bump is redrawn every
  // frame, and a frame is not a render.

  const geometry = useRef({ width: 0, tab: 0 });
  const cur = useRef(0);
  const vel = useRef(0);
  const target = useRef(0);
  const raf = useRef<number | null>(null);
  /** The first placement jumps, so nothing slides across the rail on load. */
  const settled = useRef(false);
  /** Last width the rail was measured at, to tell a real resize from a taller panel. */
  const lastWidth = useRef(0);

  const draw = useCallback(() => {
    const path = pathRef.current;
    const { width, tab } = geometry.current;
    if (!path || width === 0 || tab === 0) return;
    path.setAttribute('d', surfacePath(cur.current, tab, width));
  }, []);

  const step = useCallback(() => {
    const dt = 1 / 60;
    const a = (-SPRING.k * (cur.current - target.current) - SPRING.c * vel.current) / SPRING.m;
    vel.current += a * dt;
    cur.current += vel.current * dt;
    draw();

    if (
      Math.abs(cur.current - target.current) > SPRING_EPSILON ||
      Math.abs(vel.current) > SPRING_EPSILON
    ) {
      raf.current = requestAnimationFrame(step);
      return;
    }

    cur.current = target.current;
    vel.current = 0;
    draw();
    raf.current = null;
  }, [draw]);

  const glideTo = useCallback(
    (left: number, animate: boolean) => {
      target.current = left;
      if (animate && !reduce) {
        if (raf.current === null) raf.current = requestAnimationFrame(step);
        return;
      }
      cur.current = left;
      vel.current = 0;
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
      draw();
    },
    [draw, reduce, step],
  );

  /** Reads the rail as the browser actually laid it out, then places the bump. */
  const measure = useCallback(
    (animate: boolean) => {
      const frame = frameRef.current;
      const tab = tabRefs.current[activeRef.current];
      if (!frame || !tab) return;

      const width = frame.clientWidth;
      if (width === 0 || tab.offsetWidth === 0) return;

      geometry.current = { width, tab: tab.offsetWidth };
      setFrameW(width);
      glideTo(tab.offsetLeft, animate);
    },
    [glideTo],
  );

  useEffect(() => {
    setInteractive(true);
    // Out of the first load, but fetched before anyone can click, so the very
    // first opening morphs like all the others.
    const fetchChunk = () => {
      void import('./PhotoLightbox');
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fetchChunk);
    else window.setTimeout(fetchChunk, 1200);
  }, []);

  // A resize replaces the geometry rather than animating to it, and so does a
  // font finally arriving and changing the width of a label.
  //
  // Only a change of WIDTH counts. The rail is watched rather than the frame,
  // and the width is compared before anything is done, because the frame also
  // changes height every time a room with a different number of rows becomes
  // the active one. Treating that as a resize placed the bump instantly and
  // killed the spring in mid flight, one room change out of three.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const relayout = () => {
      const width = frameRef.current?.clientWidth ?? 0;
      if (width === 0 || width === lastWidth.current) return;
      lastWidth.current = width;
      measure(false);
    };
    relayout();

    const observer = new ResizeObserver(relayout);
    observer.observe(rail);
    if (document.fonts?.ready) void document.fonts.ready.then(relayout);
    return () => observer.disconnect();
  }, [measure]);

  // The bump follows the active tab, and only that is worth a spring.
  useEffect(() => {
    measure(settled.current);
    settled.current = true;
  }, [activeIndex, measure]);

  // The very first measurement happens before the surface exists, since it is
  // the measurement that brings it into the tree. This paints it.
  useEffect(() => {
    draw();
  }, [frameW, draw]);

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  const onTabKey = (event: KeyboardEvent<HTMLAnchorElement>) => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    const next = (activeIndex + direction + ROOM_ORDER.length) % ROOM_ORDER.length;
    setActive(ROOM_ORDER[next]);
    tabRefs.current[next]?.focus();
  };

  const openAt = useCallback(
    (index: number) => {
      setActive(photos[index].room);
      setOpen(index);
    },
    [photos],
  );

  const goTo = useCallback(
    (index: number) => {
      const wrapped = (index + photos.length) % photos.length;
      setActive(photos[wrapped].room);
      setOpen(wrapped);
    },
    [photos],
  );

  return (
    <>
      <div className="gallery-frame" ref={frameRef}>
        {frameW > 0 ? (
          <svg
            className="gallery-frame__surface"
            viewBox={`0 0 ${frameW} ${SURFACE_H}`}
            height={SURFACE_H}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path ref={pathRef} fill="currentColor" />
          </svg>
        ) : null}

        <div className="gallery-rail" ref={railRef} role={interactive ? 'tablist' : undefined}>
          {ROOM_ORDER.map((room, index) => (
            <a
              key={room}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={`gallery-tab-${room}`}
              href={`#gallery-${room}`}
              className="gallery-tab"
              role={interactive ? 'tab' : undefined}
              aria-selected={interactive ? room === active : undefined}
              aria-controls={interactive ? `gallery-${room}` : undefined}
              tabIndex={interactive && room !== active ? -1 : undefined}
              data-active={room === active ? 'true' : undefined}
              onKeyDown={onTabKey}
              onClick={(event) => {
                if (!interactive) return;
                event.preventDefault();
                setActive(room);
              }}
            >
              <span className="gallery-tab__hl" aria-hidden="true" />
              <span className="gallery-tab__label">
                <Icon name={ROOM_ICON[room]} className="gallery-tab__icon" />
                <span>{labels.rooms[room]}</span>
              </span>
            </a>
          ))}
        </div>

        <div className="gallery-body">
          {ROOM_ORDER.map((room) => (
            <GalleryPanel
              key={room}
              room={room}
              photos={byRoom.get(room) ?? []}
              labels={labels}
              active={room === active}
              interactive={interactive}
              onOpen={openAt}
            />
          ))}
        </div>
      </div>

      {open !== null ? (
        <PhotoLightbox
          photos={photos}
          index={open}
          labels={labels}
          onGoTo={goTo}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
