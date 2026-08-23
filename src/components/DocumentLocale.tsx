'use client';

import { useEffect, useLayoutEffect } from 'react';
import { endLocaleSwitch } from '@/lib/locale-switch';

type Props = {
  /** The BCP 47 tag of the language currently on screen. */
  tag: string;
};

/**
 * A layout effect, not an ordinary one, and that is the whole point of this
 * component. What it undoes, the scroll the browser does when the focused
 * control is taken out of the document, happens during React's commit; an
 * effect that runs after the paint would let the reader see the page at the
 * top for a frame before putting it back. `useEffect` on the server, because
 * a layout effect there is only a warning and this component renders nothing.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The three document level effects of a language change, in one place.
 *
 * `lang` cannot be rendered per locale by the shell above the [locale] segment
 * (see the note in src/app/layout.tsx), so it is set here, from the language
 * that is actually rendered. This component lives in the locale layout, which
 * is the subtree Next replaces on a switch, so the effect fires exactly when
 * the new language reaches the screen.
 *
 * That is also the moment the reader has to be put back where they were, and
 * the moment the words come out of their fade. Both are in
 * src/lib/locale-switch.ts, with the reasoning; the fade is cleared here rather
 * than on a timer, so it ends on the arrival itself and never on a guess.
 */
export function DocumentLocale({ tag }: Props) {
  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement;
    if (root.lang !== tag) root.lang = tag;
    return endLocaleSwitch();
  }, [tag]);

  return null;
}
