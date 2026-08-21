'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';

type Props = {
  href: string;
  label: string;
  /** What the link does, for the pointer and for the accessibility tree. */
  title: string;
};

/**
 * The notch over the booking card.
 *
 * It is a child of the card and sits behind it: the card has a ground of its
 * own and the notch a negative stack level, so until it is asked for it is
 * simply not visible, tucked under the card's top edge. Arriving, it slides up
 * out of that edge, which is the whole point of putting it there rather than
 * fading it in from nowhere.
 *
 * That trick holds only as long as the card is not a stacking context of its
 * own: relatively positioned, so it can hold the notch, and no z-index, so the
 * notch is painted before the card's background rather than inside it.
 */
export function BookingNotch({ href, label, title }: Props) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || shown) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      // A little into the page rather than on the very first pixel: the notch
      // should come out as the section arrives, not as it grazes the fold.
      { rootMargin: '0px 0px -10% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <a
      ref={ref}
      className="booking-notch"
      data-shown={shown ? 'true' : undefined}
      href={href}
      target="_blank"
      rel="noopener"
      title={title}
      aria-label={title}
    >
      <Icon name="phone" className="h-[0.85em] w-auto" />
      <span>{label}</span>
    </a>
  );
}
