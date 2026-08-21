'use client';

import { useEffect } from 'react';

type Props = {
  /** The BCP 47 tag of the language currently on screen. */
  tag: string;
};

/**
 * The two document level effects of a language change, in one place.
 *
 * `lang` cannot be rendered per locale by the shell above the [locale] segment
 * (see the note in src/app/layout.tsx), so it is set here, from the language
 * that is actually rendered. This component lives in the locale layout, which
 * is the subtree Next replaces on a switch, so the effect fires exactly when
 * the new language reaches the screen.
 *
 * That is also the moment the content has to come back: the switcher dims the
 * page while the new language is fetched, and the flag is cleared here rather
 * than on a timer, so the fade back is the arrival itself and never a guess.
 */
export function DocumentLocale({ tag }: Props) {
  useEffect(() => {
    const root = document.documentElement;
    if (root.lang !== tag) root.lang = tag;
    root.removeAttribute('data-locale-switching');
  }, [tag]);

  return null;
}
