'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Texts reveal on scroll. The attribute is only added once the observer runs,
 * so content is fully visible without JavaScript, and the reduced-motion
 * tokens in _root.css collapse the animation to nothing.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    node.setAttribute('data-reveal', '');
    node.style.transitionDelay = `${delay}ms`;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            node.setAttribute('data-reveal', 'shown');
            observer.unobserve(node);
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
