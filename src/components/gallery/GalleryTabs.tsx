'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { Icon, type IconName } from '@/components/Icon';
import { ROOM_ORDER, type RoomId } from '@/lib/rooms';
import { GalleryPanel } from './GalleryPanel';
import { contentWidth, RAIL_H, SPRING, surfacePath, tabSlots, tabWidth } from './liquid-path';
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

/** Edge fades only appear once the rail actually overflows. */
type Overflow = 'none' | 'left' | 'right' | 'both';

export function GalleryTabs({ photos, labels }: { photos: PhotoView[]; labels: GalleryLabels }) {
  const reduce = useReducedMotion();

  const [active, setActive] = useState<RoomId>(ROOM_ORDER[0]);
  const [open, setOpen] = useState<number | null>(null);
  /**
   * Everything is shown until this flips, which is what makes the first client
   * render match the server one and the page work with JavaScript off.
   */
  const [interactive, setInteractive] = useState(false);

  const byRoom = useMemo(() => {
    const map = new Map<RoomId, PhotoView[]>();
    for (const room of ROOM_ORDER) map.set(room, []);
    for (const photo of photos) map.get(photo.room)?.push(photo);
    return map;
  }, [photos]);

  const activeIndex = ROOM_ORDER.indexOf(active);

  // Geometry

  const frameRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const settled = useRef(false);

  const [tabW, setTabW] = useState(0);
  const [overflow, setOverflow] = useState<Overflow>('none');

  const left = useMotionValue(0);
  const smooth = useSpring(left, SPRING);
  const widthValue = useMotionValue(0);
  const tabValue = useMotionValue(0);
  const path = useTransform([smooth, widthValue, tabValue], ([x, w, t]) =>
    w > 0 && t > 0 ? surfacePath(x as number, w as number, t as number) : '',
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

  useEffect(() => {
    const frame = frameRef.current;
    const measure = measureRef.current;
    if (!frame || !measure) return;

    const compute = () => {
      const natural = Array.from(measure.children).reduce(
        (widest, node) => Math.max(widest, Math.ceil(node.getBoundingClientRect().width)),
        0,
      );
      if (natural === 0) return;
      const next = tabWidth(frame.clientWidth, ROOM_ORDER.length, natural);
      setTabW(next);
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(frame);
    observer.observe(measure);
    return () => observer.disconnect();
  }, []);

  // The bump follows the active tab. The first placement jumps, so nothing
  // slides across the rail on page load.
  useEffect(() => {
    if (tabW === 0) return;
    widthValue.set(contentWidth(ROOM_ORDER.length, tabW));
    tabValue.set(tabW);

    const target = tabSlots(ROOM_ORDER.length, tabW)[activeIndex];
    if (!settled.current || reduce) {
      left.jump(target);
      smooth.jump(target);
      settled.current = true;
    } else {
      left.set(target);
    }
  }, [tabW, activeIndex, reduce, left, smooth, widthValue, tabValue]);

  const readOverflow = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    if (max <= 1) {
      setOverflow('none');
      return;
    }
    const atStart = scroller.scrollLeft <= 1;
    const atEnd = scroller.scrollLeft >= max - 1;
    setOverflow(atStart ? 'right' : atEnd ? 'left' : 'both');
  }, []);

  useEffect(() => {
    readOverflow();
  }, [readOverflow, tabW]);

  // The active tab is brought back into view, including when it is the
  // lightbox walking into the next room rather than a click.
  useEffect(() => {
    if (!interactive || tabW === 0) return;
    const scroller = scrollerRef.current;
    const tab = tabRefs.current[activeIndex];
    if (!scroller || !tab) return;

    const leftEdge = tab.offsetLeft;
    const rightEdge = leftEdge + tab.offsetWidth;
    const viewLeft = scroller.scrollLeft;
    const viewRight = viewLeft + scroller.clientWidth;
    if (leftEdge >= viewLeft && rightEdge <= viewRight) return;

    scroller.scrollTo({
      left: leftEdge - (scroller.clientWidth - tab.offsetWidth) / 2,
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, [activeIndex, interactive, tabW, reduce]);

  const selectRoom = useCallback((room: RoomId) => {
    setActive(room);
  }, []);

  const onTabKey = (event: KeyboardEvent<HTMLAnchorElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (activeIndex + step + ROOM_ORDER.length) % ROOM_ORDER.length;
    selectRoom(ROOM_ORDER[next]);
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
        <div className="gallery-rail">
          <div
            className="gallery-rail__scroller"
            ref={scrollerRef}
            data-overflow={overflow}
            onScroll={readOverflow}
          >
            <div
              className="gallery-rail__track"
              style={tabW ? { width: contentWidth(ROOM_ORDER.length, tabW) } : undefined}
            >
              {tabW > 0 ? (
                <svg
                  className="gallery-rail__surface"
                  width={contentWidth(ROOM_ORDER.length, tabW)}
                  height={RAIL_H + 2}
                  viewBox={`0 0 ${contentWidth(ROOM_ORDER.length, tabW)} ${RAIL_H + 2}`}
                  aria-hidden="true"
                  focusable="false"
                >
                  <motion.path d={path} fill="currentColor" />
                </svg>
              ) : null}

              <div className="gallery-rail__tabs" role={interactive ? 'tablist' : undefined}>
                {ROOM_ORDER.map((room, index) => (
                    <a
                      key={room}
                      ref={(node) => {
                        tabRefs.current[index] = node;
                      }}
                      id={`gallery-tab-${room}`}
                      href={`#gallery-${room}`}
                      className="gallery-tab"
                      style={tabW ? { width: tabW } : undefined}
                      role={interactive ? 'tab' : undefined}
                      aria-selected={interactive ? room === active : undefined}
                      aria-controls={interactive ? `gallery-${room}` : undefined}
                      tabIndex={interactive && room !== active ? -1 : undefined}
                      data-active={room === active ? 'true' : undefined}
                      onKeyDown={onTabKey}
                      onClick={(event) => {
                        if (!interactive) return;
                        event.preventDefault();
                        selectRoom(room);
                      }}
                    >
                      <Icon name={ROOM_ICON[room]} className="gallery-tab__icon" />
                      {labels.rooms[room]}
                    </a>
                ))}
              </div>

              {/* Measured at its natural width, so the tipping point into a
                  scrolling rail follows the language instead of a breakpoint. */}
              <div className="gallery-rail__measure" ref={measureRef} aria-hidden="true">
                {ROOM_ORDER.map((room) => (
                  <span key={room} className="gallery-tab">
                    <Icon name={ROOM_ICON[room]} className="gallery-tab__icon" />
                    {labels.rooms[room]}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

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

      <AnimatePresence>
        {open !== null ? (
          <PhotoLightbox
            photos={photos}
            index={open}
            labels={labels}
            onGoTo={goTo}
            onClose={() => setOpen(null)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
