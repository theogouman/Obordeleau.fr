'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { ReviewCard, type ReviewCardLabels } from '@/components/ReviewCard';
import { ReviewsSourceMenu, type SourceMenuLabels } from '@/components/ReviewsSourceMenu';
import { ReviewsWall, type WallItem } from '@/components/ReviewsWall';
import type { Review, ReviewSource } from '@/lib/reviews';

/*
 * Filtering rearranges, it does not blink (interior.dev, filter grid). The
 * cards that stay travel from where they were to where they now are, the ones
 * that go fade out first so nothing moves under a card still on screen, and
 * the ones that arrive come up into the gap.
 *
 * The reference implementation drives this with a layout animation library.
 * Here it is the first principle behind it, measured by hand: the positions
 * are read before the list changes, read again after it, and the difference is
 * played back as a transform. It costs no dependency on a site whose whole
 * argument is that it loads fast, and the timings below are the reference's.
 */
const MOVE_MS = 200;
const MOVE_EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const LEAVE_MS = 140;
const RECENT_MONTHS = 3;

export type ReviewFilterLabels = SourceMenuLabels & {
  legend: string;
  recent: string;
  lowest: string;
  highest: string;
  platform: string;
  result: string;
  empty: string;
};

type Mode = 'all' | 'recent' | 'lowest' | 'highest';

const CHIPS: Array<{ mode: Exclude<Mode, 'all'>; icon: IconName }> = [
  { mode: 'recent', icon: 'clockRotate' },
  { mode: 'lowest', icon: 'starSlash' },
  { mode: 'highest', icon: 'starFill' },
];

/* The measure and the move must happen before the browser paints, and there is
   nothing to measure on the server. */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** The first day of the window, as the same yyyy-mm-dd string the reviews carry. */
function monthsAgo(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

type Props = {
  reviews: Review[];
  labels: ReviewCardLabels;
  filters: ReviewFilterLabels;
};

export function ReviewsBrowser({ reviews, labels, filters }: Props) {
  const [mode, setMode] = useState<Mode>('all');
  const [source, setSource] = useState<ReviewSource | null>(null);

  // The order the page opens on: the newest review first. Everything below
  // reads from this list, so a filter never has to sort it back.
  const selected = useMemo(() => {
    const list = source ? reviews.filter((review) => review.source === source) : reviews;

    if (mode === 'recent') {
      const limit = monthsAgo(RECENT_MONTHS);
      return list.filter((review) => review.dateIso >= limit);
    }
    if (mode === 'highest') {
      return list.filter((review) => review.rating >= 5);
    }
    if (mode === 'lowest') {
      return [...list]
        .filter((review) => review.rating < 5)
        .sort((a, b) => a.rating - b.rating || b.dateIso.localeCompare(a.dateIso));
    }
    return list;
  }, [reviews, mode, source]);

  // What is on screen, which lags the selection by the length of the fade out.
  const [shown, setShown] = useState<Review[]>(selected);
  const [leaving, setLeaving] = useState<string[]>([]);
  const rects = useRef<Map<string, DOMRect> | null>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  const snapshot = useCallback(() => {
    const wall = wallRef.current;
    if (!wall) return;
    const map = new Map<string, DOMRect>();
    wall.querySelectorAll<HTMLElement>('[data-review]').forEach((node) => {
      const id = node.dataset.review;
      if (id) map.set(id, node.getBoundingClientRect());
    });
    rects.current = map;
  }, []);

  useEffect(() => {
    if (selected === shown) return;

    if (prefersReducedMotion()) {
      setShown(selected);
      return;
    }

    const next = new Set(selected.map((review) => review.id));
    const going = shown.filter((review) => !next.has(review.id)).map((review) => review.id);

    if (timer.current !== null) window.clearTimeout(timer.current);

    if (going.length === 0) {
      snapshot();
      setShown(selected);
      return;
    }

    setLeaving(going);
    timer.current = window.setTimeout(() => {
      // Nothing has moved during the fade, so the positions read now are still
      // the ones the survivors are travelling from.
      snapshot();
      setLeaving([]);
      setShown(selected);
    }, LEAVE_MS);
    // `shown` is the state this effect writes: reacting to it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, snapshot]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  useBeforePaint(() => {
    const before = rects.current;
    const wall = wallRef.current;
    rects.current = null;
    if (!before || !wall) return;

    const moves: Array<[HTMLElement, number, number]> = [];

    wall.querySelectorAll<HTMLElement>('[data-review]').forEach((node) => {
      const id = node.dataset.review;
      const from = id ? before.get(id) : undefined;
      const to = node.getBoundingClientRect();

      if (!from) {
        // The flag has to go once the animation is over. A finished animation
        // with a fill of both keeps holding the properties it animated, and it
        // would hold transform against the next move this card is asked to
        // make.
        node.dataset.entering = 'true';
        node.addEventListener(
          'animationend',
          () => {
            delete node.dataset.entering;
          },
          { once: true },
        );
        return;
      }

      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (dx === 0 && dy === 0) return;

      node.style.transition = 'none';
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      moves.push([node, dx, dy]);
    });

    const frame = requestAnimationFrame(() => {
      moves.forEach(([node]) => {
        node.style.transition = `transform ${MOVE_MS}ms ${MOVE_EASE}`;
        node.style.transform = '';
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [shown]);

  const items: WallItem[] = shown.map((review) => ({
    id: review.id,
    leaving: leaving.includes(review.id),
    node: <ReviewCard review={review} labels={labels} />,
  }));

  const active = mode !== 'all' || source !== null;

  /*
   * One filter at a time. The platform is a way of cutting the wall like the
   * three chips are, not a second dimension laid over them: picking one drops
   * whatever was picked before, and the bar always describes a single state.
   */
  function pick(next: Exclude<Mode, 'all'>) {
    setSource(null);
    setMode((current) => (current === next ? 'all' : next));
  }

  function pickSource(next: ReviewSource | null) {
    setMode('all');
    setSource(next);
  }

  return (
    <div className="mt-10">
      <div className="reviews-filters" role="group" aria-label={filters.legend}>
        {CHIPS.map((chip) => (
          <button
            key={chip.mode}
            type="button"
            className="filter-chip"
            aria-pressed={mode === chip.mode}
            onClick={() => pick(chip.mode)}
          >
            <Icon name={chip.icon} className="h-3.5 w-auto shrink-0" />
            <span>{filters[chip.mode]}</span>
          </button>
        ))}

        <ReviewsSourceMenu value={source} onChange={pickSource} labels={filters} />

        {active ? (
          <button
            type="button"
            className="filter-clear"
            onClick={() => {
              setMode('all');
              setSource(null);
            }}
          >
            {filters.clear}
          </button>
        ) : null}
      </div>

      {/* Not on the page any more, still announced: a filter that silently
          changes what is under it leaves a screen reader with no way of
          knowing anything happened. */}
      <p className="visually-hidden" aria-live="polite">
        {filters.result.replace('{count}', String(selected.length))}
      </p>

      {shown.length === 0 ? (
        <p className="mt-8 rounded-[var(--radius-card)] border border-dashed border-[rgba(58,42,38,0.25)] p-6 text-ink-soft">
          {filters.empty}
        </p>
      ) : (
        <div ref={wallRef}>
          <ReviewsWall items={items} className="mt-8" />
        </div>
      )}
    </div>
  );
}
