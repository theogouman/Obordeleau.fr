'use client';

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useLocale } from 'next-intl';
import { knownFlagSupport, supportsFlagEmoji } from '@/components/flag-emoji';
import { beginLocaleSwitch } from '@/lib/locale-switch';
import { useRouter } from 'next/navigation';
import { Link, getPathname, usePathname } from '@/i18n/navigation';
import { localeFlags, localeNames, routing, type Locale } from '@/i18n/routing';

/** Matches --morph-close-dur: the language lands once the panel has closed. */
const CLOSE_MS = 250;

type Props = {
  /** The word that titles the open list, and names the menu. */
  label: string;
  /** What the key itself does, for the name it carries when closed. */
  switchLabel: string;
  /**
   * Which corner the panel grows out of. In the header the key sits near the
   * right edge, so the panel has to open towards the middle of the page.
   */
  align?: 'start' | 'end';
  className?: string;
};

function LanguagesGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lang-key__icon"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}

/**
 * The language control of the header, on transitions.dev plus to menu morph
 * (20), the same snippet and the same tokens as the platform filter on the
 * reviews page: the key does not open a panel beside itself, it becomes the
 * panel. The box grows out of the corner the trigger is pinned to, its radius
 * relaxes, the key slides out and the languages slide in.
 *
 * Closed it is the control the payment recap uses to reopen an answer: a small
 * rounded square with a ground of its own, so it reads as a key on the header
 * rather than as a word in the nav.
 *
 * Choosing plays the close first and navigates after it, so the panel folding
 * away and the page arriving in its new language are two movements in a row
 * rather than one on top of the other. The footer keeps the pill: down there
 * the four languages are the point, up here they are one key.
 */
export function LanguageMenu({ label, switchLabel, align = 'end', className = '' }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const active = useLocale() as Locale;

  const [open, setOpen] = useState(false);
  // Starts from the module cache, so an instance that replaces another one
  // never flashes the language codes before the flags.
  const [flags, setFlags] = useState(knownFlagSupport);
  const [, startTransition] = useTransition();

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setFlags(supportsFlagEmoji());
  }, []);

  // The header no longer unmounts between pages, so a panel left open has to
  // be closed by hand once a link inside it has landed somewhere else.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: Event) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function go(locale: Locale) {
    /*
     * Choosing sends the focus back to the key, and the key is inside the
     * subtree the switch replaces: without this the browser would lose the
     * focus with it and scroll the reader to the top of the page. The selector
     * is what this same key is called in the tree that arrives, and `align` is
     * what tells the header one apart from the one in the mobile menu. The
     * reasoning is in src/lib/locale-switch.ts.
     */
    beginLocaleSwitch(`.lang-key[data-align="${align}"] .lang-key__trigger`);

    // Next's own router, on the path the middleware would have settled on:
    // next intl's forces the /fr prefix, which redirects, which the App Router
    // can only answer with a full document load. The long version is in
    // LanguageSwitcher.
    startTransition(() => {
      router.replace(getPathname({ href: pathname, locale }), { scroll: false });
    });
  }

  function select(event: ReactMouseEvent<HTMLAnchorElement>, locale: Locale) {
    // A middle click or a modified click still belongs to the browser.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    event.preventDefault();
    setOpen(false);
    triggerRef.current?.focus();

    if (locale === active) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      go(locale);
      return;
    }

    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => go(locale), CLOSE_MS);
  }

  return (
    <div ref={rootRef} data-align={align} className={`lang-key ${className}`}>
      <div className="t-morph lang-key__morph" data-open={open ? 'true' : 'false'}>
        <div className="t-morph-menu lang-key__menu" role="menu" aria-label={label}>
          <p className="lang-key__title">{label}</p>

          {routing.locales.map((locale) => (
            <Link
              key={locale}
              href={pathname}
              locale={locale}
              hrefLang={locale}
              role="menuitemradio"
              aria-checked={locale === active}
              aria-current={locale === active ? 'true' : undefined}
              tabIndex={open ? 0 : -1}
              onClick={(event) => select(event, locale)}
              className="lang-key__option"
            >
              <span aria-hidden="true" className={flags ? 'lang-key__flag' : 'lang-key__code'}>
                {flags ? localeFlags[locale] : locale}
              </span>
              <span>{localeNames[locale]}</span>
            </Link>
          ))}
        </div>

        <button
          ref={triggerRef}
          type="button"
          className="t-morph-plus lang-key__trigger"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`${switchLabel}: ${localeNames[active]}`}
          title={switchLabel}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
        >
          <LanguagesGlyph />
        </button>
      </div>
    </div>
  );
}
