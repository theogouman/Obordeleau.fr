/**
 * A language change, and the two things it must not cost the reader.
 *
 * The switch has been a client navigation for a while: the document shell sits
 * above the [locale] segment, so nothing reloads and no script is parsed twice
 * (see the note in src/app/layout.tsx). What still moved was the reader.
 *
 * Clicking a language with a mouse or a finger focuses the control that was
 * clicked. That control lives inside the subtree the switch replaces, so React
 * takes it out of the document, the browser has nowhere to put the focus and
 * drops it on <body>, and the page scrolls to the top. Measured on the live
 * site: from any depth, a real click landed at 0, while the same navigation
 * fired from a script, which focuses nothing, held its position exactly. So it
 * was never the navigation, and never the height of the page. It was the focus.
 *
 * Both are put back here. The switcher says where the reader is and which
 * control they used, and DocumentLocale calls the other half on the frame the
 * new language is painted: the focus goes back on the matching control in the
 * new tree, without scrolling to it, and the position is restored for a few
 * frames afterwards, because the subtree that has just mounted sets heights of
 * its own in effects of its own and a document that is briefly shorter clamps
 * the scroll.
 *
 * The flag on <html> is what the words fade under while the new language is
 * fetched; see the block in globals.css.
 */

/** What has to be put back once the new language is on screen. */
type Pending = {
  scrollTop: number;
  scrollLeft: number;
  /** The control that was used, as a selector that also matches its twin. */
  focus: string | null;
};

let pending: Pending | null = null;
let safety: number | null = null;

/** Mirrors the locale-arrive keyframes in globals.css. */
const ARRIVE_MS = 300;
/** Only for a navigation that never lands: the page must not stay dimmed. */
const SAFETY_MS = 4000;
/**
 * How many frames the position is held for. One is not enough: the tree that
 * has just mounted is still sizing itself, and the around section alone is
 * three viewports of height that a layout effect puts back.
 */
const SETTLE_FRAMES = 4;

function clearSafety() {
  if (safety === null) return;
  window.clearTimeout(safety);
  safety = null;
}

/**
 * Called the moment a language is chosen, before the navigation starts.
 *
 * `focus` is a selector for the control that was clicked, written so that it
 * matches the same control in the tree that replaces this one.
 */
export function beginLocaleSwitch(focus: string | null): void {
  const root = document.documentElement;

  pending = { scrollTop: window.scrollY, scrollLeft: window.scrollX, focus };
  root.setAttribute('data-locale-switching', '');
  root.removeAttribute('data-locale-arrived');

  clearSafety();
  safety = window.setTimeout(() => {
    pending = null;
    safety = null;
    root.removeAttribute('data-locale-switching');
  }, SAFETY_MS);
}

/**
 * Called from a layout effect in the new language's tree, so everything below
 * happens on the commit that swapped the words and before the browser paints
 * them. Returns a cleanup for the frame loop it starts.
 */
export function endLocaleSwitch(): (() => void) | undefined {
  const root = document.documentElement;
  if (!pending) return undefined;

  const { scrollTop, scrollLeft, focus } = pending;
  pending = null;
  clearSafety();

  if (focus) {
    // preventScroll, because bringing the control back into view is exactly
    // the movement this whole file exists to stop.
    document.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
  }

  let frames = 0;
  let raf = 0;

  const settle = () => {
    if (Math.abs(window.scrollY - scrollTop) > 1) {
      // 'instant' rather than a plain scrollTo: `scroll-behavior: smooth` is on
      // the document, so the default would animate its way back over half a
      // second instead of putting the page where it was.
      window.scrollTo({ top: scrollTop, left: scrollLeft, behavior: 'instant' });
    }

    frames += 1;
    if (frames < SETTLE_FRAMES) {
      raf = window.requestAnimationFrame(settle);
      return;
    }

    root.removeAttribute('data-locale-switching');
    root.setAttribute('data-locale-arrived', '');
    window.setTimeout(() => root.removeAttribute('data-locale-arrived'), ARRIVE_MS);
  };

  settle();

  return () => window.cancelAnimationFrame(raf);
}
