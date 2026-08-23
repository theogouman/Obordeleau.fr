'use client';

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * The JavaScript side of the reduced-motion guard. `_root.css` takes care of
 * the CSS side; the springs and the morph are driven from here, so they need
 * to be asked directly.
 *
 * Answered on the first render rather than in an effect, so a morph never has
 * the time to start before the answer arrives. Nothing rendered depends on it,
 * only motion does, so the server saying `false` costs no hydration warning.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(QUERY);
    setReduce(query.matches);

    const onChange = () => setReduce(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduce;
}
