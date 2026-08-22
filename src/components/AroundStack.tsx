'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The places nearby, stacking as the section is scrolled through.
 *
 * The heading travels with them. It used to sit above the tall scroll box, so
 * the moment the pile took over the screen the section lost its own name and
 * the reader was left with cards and no idea what they were a list of. It is
 * inside the pinned frame now, over the pile, and stays for the whole of the
 * scroll. That also closes the gap the old arrangement opened: the frame was a
 * whole viewport with the cards centred in it, which put most of a screen of
 * nothing between the paragraph and the first card.
 *
 * The mechanism is the one in theogouman/Consultant-Notion (ProcessStack): a
 * container as tall as one viewport per card creates the distance, a frame
 * inside it is pinned for the whole of that distance, and each card after the
 * first rises from the bottom and lands slightly lower than the one before, so
 * the pile reads as a pile.
 *
 * What is not ported: that component also drives an animated illustration per
 * card. These cards are a photograph and a sentence, so there is nothing to
 * replay and no observer is needed.
 *
 * The static, readable stack is the default, and it is what the server sends.
 * The animation is opted into here, once, by an attribute. No JavaScript and
 * `prefers-reduced-motion: reduce` therefore both land on the same plain
 * vertical list, which is a hard requirement of the constitution rather than a
 * courtesy.
 */

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** How much lower each card lands than the one under it. */
const LAND_STEP = 12;
const CARD_MAX_DESKTOP = 420;
const CARD_MAX_MOBILE = 540;
const CARD_MIN = 260;
/**
 * Where the frame pins: 5.5rem down, clear of the sticky site header. It is a
 * `top` in the stylesheet and a number here, and the two have to agree, since
 * the scroll position is read against it.
 */
const STICKY_TOP = 88;
/** Air kept under the pile so it never sits on the fold. */
const BOTTOM_AIR = 24;
/** A little more than the fold, so a waiting card takes its shadow with it. */
const OFF_SCREEN = 32;
/** The gap under the heading, matching the stylesheet. */
const HEAD_GAP = 24;
const RESIZE_SETTLE_MS = 150;
/**
 * How much the viewport height may move before it counts as a real resize.
 *
 * A mobile browser hides and shows its address bar as the page is scrolled,
 * and every one of those is a resize event carrying a new innerHeight. Card
 * heights are worked out from that number, and the photograph on a card fills
 * whatever its text leaves, so re-measuring in the middle of a scroll crops
 * the picture again: the image on a card that is not moving appears to change
 * size, a fraction of a second after the finger has stopped. No address bar
 * comes near this figure, and a change that clears it is a real one.
 */
const CHROME_SLACK = 160;

export function AroundStack({ header, children }: { header: ReactNode; children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroll = scrollRef.current;
    const area = cardsRef.current;
    const frame = frameRef.current;
    if (!scroll || !area || !frame) return;

    const cards = Array.from(area.querySelectorAll<HTMLElement>('.around-card'));
    const segments = cards.length - 1;
    if (segments <= 0) return;

    /** Total drop of the pile. */
    const landing = segments * LAND_STEP;
    /**
     * Where a card waits: below the fold, not below the frame.
     *
     * Nothing here clips any more. A frame that clips has to cut a card that is
     * halfway up it, which is how a card came to arrive in two halves, and it
     * cuts every shadow along its edges as well. So a card waits off the bottom
     * of the screen instead, where nothing has to be cut to keep it out of
     * sight, and rises into the pile whole. Measured on every layout, because
     * it is a distance from the pinned pile to the fold.
     */
    let away = 0;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Nothing above this line touches the layout.
    scroll.dataset.stack = 'on';
    const stack = cards.slice(1);

    let resizeTimer = 0;

    /*
     * `sizeCards` is the half that is worth protecting from a passing address
     * bar. The rest is measured every time: where a card waits is a distance
     * to the fold, so it has to follow the fold, and it costs nothing to be
     * wrong about it for one frame since a waiting card is hidden anyway.
     */
    const layout = (sizeCards = true) => {
      scroll.style.height = `${cards.length * 100}vh`;

      const isDesktop = window.innerWidth >= 768;
      // What the heading takes is measured rather than assumed: it is three
      // lines in German and one in English at the same width.
      const head = headRef.current ? headRef.current.offsetHeight + HEAD_GAP : 0;
      const room = window.innerHeight - STICKY_TOP - BOTTOM_AIR - head - landing;

      // The pile's own top sits STICKY_TOP + head down the screen once pinned,
      // so this is what a card has to be pushed down by to clear the fold.
      away = window.innerHeight - STICKY_TOP - head + OFF_SCREEN;

      // The frame is exactly as tall as what it holds, and what it holds ends
      // lower than the first card: every card after it lands a step further
      // down. Asking for that much room is what makes the section close on the
      // bottom of the pile rather than on the bottom of the top card.
      area.style.paddingBottom = `${landing}px`;

      if (!sizeCards) return;

      const height = Math.max(
        CARD_MIN,
        Math.min(room, isDesktop ? CARD_MAX_DESKTOP : CARD_MAX_MOBILE),
      );

      for (const card of cards) card.style.height = `${height}px`;
    };

    layout();

    // The window as the cards were last measured against it.
    let sizedWidth = window.innerWidth;
    let sizedHeight = window.innerHeight;

    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        // A different width is always real. A different height only when it
        // has moved further than an address bar can account for.
        const real = width !== sizedWidth || Math.abs(height - sizedHeight) >= CHROME_SLACK;

        if (real) {
          sizedWidth = width;
          sizedHeight = height;
        }

        layout(real);
      }, RESIZE_SETTLE_MS);
    };
    window.addEventListener('resize', onResize);

    stack.forEach((card, index) => {
      card.style.zIndex = String(20 + index * 10);
      card.style.transform = `translateY(${away}px) scale(0.96)`;
      card.style.visibility = 'hidden';
    });

    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;

        // The frame is pinned from the moment the box's top passes the sticky
        // line until its bottom arrives, so the travel is the box less the
        // frame, and the position is read against the same line.
        const distance = scroll.offsetHeight - frame.offsetHeight;
        if (distance <= 0) return;

        const scrolled = STICKY_TOP - scroll.getBoundingClientRect().top;
        const progress = Math.max(0, Math.min(1, scrolled / distance));

        stack.forEach((card, index) => {
          // The progress split into one equal segment per card, written as a
          // single expression: card `index` owns [index / segments, (index + 1)
          // / segments], so its local progress is `progress * segments - index`.
          const local = Math.max(0, Math.min(1, progress * segments - index));
          const eased = easeOut(local);

          // Two ends to travel between: off the bottom of the screen, and
          // landed a step lower than the card under it.
          const rest = (index + 1) * LAND_STEP;
          const shift = away + (rest - away) * eased;

          card.style.visibility = local > 0 ? 'visible' : 'hidden';
          card.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0) scale(${(
            0.96 +
            0.04 * eased
          ).toFixed(4)})`;
        });
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.clearTimeout(resizeTimer);

      delete scroll.dataset.stack;
      scroll.style.height = '';
      area.style.paddingBottom = '';
      for (const card of cards) {
        card.style.height = '';
        card.style.transform = '';
        card.style.visibility = '';
        card.style.zIndex = '';
      }
    };
  }, []);

  return (
    <div ref={scrollRef} className="around-stack">
      <div ref={frameRef} className="around-stack__sticky">
        <div ref={headRef} className="around-stack__head">
          {header}
        </div>

        <div ref={cardsRef} className="around-stack__cards">
          {children}
        </div>
      </div>
    </div>
  );
}
