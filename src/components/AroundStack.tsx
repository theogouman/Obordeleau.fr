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
 * Room the pinned frame gives away: 5.5rem at the top for the sticky site
 * header, 1.5rem at the bottom for air. It is padding in the stylesheet and a
 * number here, and the two have to agree, because this is what the card height
 * is worked out from.
 */
const HEADER_ROOM = 112;
/** The gap under the heading, matching the stylesheet. */
const HEAD_GAP = 24;
const RESIZE_SETTLE_MS = 150;

export function AroundStack({ header, children }: { header: ReactNode; children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroll = scrollRef.current;
    const area = cardsRef.current;
    if (!scroll || !area) return;

    const cards = Array.from(area.querySelectorAll<HTMLElement>('.around-card'));
    const segments = cards.length - 1;
    if (segments <= 0) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Nothing above this line touches the layout.
    scroll.dataset.stack = 'on';
    const stack = cards.slice(1);

    let resizeTimer = 0;

    const layout = () => {
      scroll.style.height = `${cards.length * 100}vh`;

      const isDesktop = window.innerWidth >= 768;
      // What the heading takes is measured rather than assumed: it is three
      // lines in German and one in English at the same width.
      const head = headRef.current ? headRef.current.offsetHeight + HEAD_GAP : 0;
      const room = window.innerHeight - HEADER_ROOM - head - segments * LAND_STEP;
      const height = Math.max(
        CARD_MIN,
        Math.min(room, isDesktop ? CARD_MAX_DESKTOP : CARD_MAX_MOBILE),
      );

      for (const card of cards) card.style.height = `${height}px`;
    };

    layout();

    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(layout, RESIZE_SETTLE_MS);
    };
    window.addEventListener('resize', onResize);

    stack.forEach((card, index) => {
      card.style.zIndex = String(20 + index * 10);
      card.style.transform = 'translateY(100%) scale(0.96)';
      card.style.visibility = 'hidden';
    });

    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;

        const distance = scroll.offsetHeight - window.innerHeight;
        if (distance <= 0) return;

        const scrolled = -scroll.getBoundingClientRect().top;
        const progress = Math.max(0, Math.min(1, scrolled / distance));

        stack.forEach((card, index) => {
          // The progress split into one equal segment per card, written as a
          // single expression: card `index` owns [index / segments, (index + 1)
          // / segments], so its local progress is `progress * segments - index`.
          const local = Math.max(0, Math.min(1, progress * segments - index));
          const eased = easeOut(local);

          card.style.visibility = local > 0 ? 'visible' : 'hidden';
          card.style.transform = `translate3d(0, calc(${(100 * (1 - eased)).toFixed(1)}% + ${
            (index + 1) * LAND_STEP
          }px), 0) scale(${(0.96 + 0.04 * eased).toFixed(4)})`;
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
      <div className="around-stack__sticky">
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
