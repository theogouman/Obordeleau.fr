'use client';

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { useLocale } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { localeFlags, localeNames, routing, type Locale } from '@/i18n/routing';

type Props = {
  label: string;
  className?: string;
  /** The footer sits on the dark ink background. */
  tone?: 'light' | 'dark';
};

/**
 * Measured once per page: a system without a flag font paints a regional
 * indicator pair as two letter boxes, which would read as a bug next to two
 * real flags. The French flag is drawn on a canvas in black text and the
 * pixels are read back. A painted flag brings its blue stripe, the fallback
 * brings black only, and the switcher then keeps the language codes.
 */
let flagSupport: boolean | undefined;

/**
 * Where the pill was when the last instance of this switcher was measured.
 *
 * A language change replaces the whole locale subtree, so the switcher on
 * screen afterwards is a new component with new DOM: its pill cannot inherit
 * the CSS transition of the old one. It inherits the position instead, mounts
 * exactly where the visitor last saw the pill, and travels from there to the
 * language that just arrived. The cache is module scope, so it lives as long
 * as the JavaScript context does, which is precisely as long as there is no
 * full page load. It is never written on the server: only the measuring
 * effect writes it, and effects do not run there.
 */
let lastGeometry: { x: number; width: number } | null = null;

function supportsFlagEmoji(): boolean {
  if (flagSupport !== undefined) return flagSupport;

  flagSupport = false;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (context) {
      context.textBaseline = 'top';
      context.font = '20px sans-serif';
      context.fillStyle = '#000000';
      context.fillText(localeFlags.fr, 0, 0);

      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < data.length; index += 4) {
        const isPainted = data[index + 3] > 96;
        const isBlue = data[index + 2] > data[index] + 48;
        if (isPainted && isBlue) {
          flagSupport = true;
          break;
        }
      }
    }
  } catch {
    flagSupport = false;
  }

  return flagSupport;
}

/**
 * FR-005: the switcher keeps the visitor on the same page, and the switch is a
 * client navigation. The shell above the [locale] segment is what makes that
 * possible (see src/app/layout.tsx): the document is never reloaded, so the
 * page the visitor is leaving stays on screen, dimmed, until the new language
 * arrives, and the pill then slides across in one movement.
 *
 * The pill deliberately does not move on the click. It waits for the language
 * to actually land, because a navigation that is served from the prefetch
 * cache commits in a few milliseconds: an optimistic slide would be cut off
 * halfway by the new subtree almost every time.
 */
export function LanguageSwitcher({ label, className = '', tone = 'light' }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const active = useLocale() as Locale;

  const [, startTransition] = useTransition();
  // Both start from the module cache, so an instance that replaces another one
  // never flashes the language codes before the flags, and never blinks its
  // pill back to nothing before measuring itself.
  const [flags, setFlags] = useState(() => flagSupport === true);
  const [pill, setPill] = useState<{ x: number; width: number } | null>(() => lastGeometry);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFlags(supportsFlagEmoji());
  }, []);

  useEffect(() => {
    let cancelled = false;

    const measure = () => {
      const option = trackRef.current?.querySelector<HTMLElement>(`[data-locale="${active}"]`);
      // The mobile menu is display:none until it opens, and a hidden option
      // measures zero. That is not a position, so it is neither shown nor
      // cached; the observer below measures again when the menu opens.
      if (cancelled || !option || option.offsetWidth === 0) return;

      const next = { x: option.offsetLeft, width: option.offsetWidth };
      lastGeometry = next;
      setPill((current) =>
        current && current.x === next.x && current.width === next.width ? current : next,
      );
    };

    // One frame at the inherited position first, otherwise the pill is already
    // at its destination when the browser paints and there is nothing to
    // animate. On a first load there is nothing to inherit and the pill simply
    // fades in where it belongs.
    const frame = requestAnimationFrame(measure);

    const observer = new ResizeObserver(measure);
    if (trackRef.current) observer.observe(trackRef.current);

    // A late web font changes the width of every option under the pill.
    document.fonts?.ready.then(measure).catch(() => {});

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [active, flags]);

  const select = (event: MouseEvent<HTMLAnchorElement>, locale: Locale) => {
    // A middle click or a modified click still belongs to the browser.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    event.preventDefault();
    if (locale === active) return;

    const root = document.documentElement;
    root.setAttribute('data-locale-switching', '');
    // DocumentLocale clears the flag when the new language is painted. This is
    // only the safety net for a navigation that never lands.
    window.setTimeout(() => root.removeAttribute('data-locale-switching'), 4000);

    startTransition(() => {
      router.replace(pathname, { locale, scroll: false });
    });
  };

  const style = pill
    ? ({ '--pill-x': `${pill.x}px`, '--pill-w': `${pill.width}px` } as CSSProperties)
    : undefined;

  return (
    <div
      ref={trackRef}
      role="group"
      aria-label={label}
      data-tone={tone}
      data-mode={flags ? 'flags' : 'code'}
      data-ready={pill ? 'true' : 'false'}
      style={style}
      className={`lang-switch ${className}`}
    >
      <span aria-hidden="true" className="lang-switch__pill" />

      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          hrefLang={locale}
          data-locale={locale}
          aria-current={locale === active ? 'true' : undefined}
          onClick={(event) => select(event, locale)}
          className="lang-switch__option"
        >
          <span aria-hidden="true" className={flags ? 'lang-switch__flag' : undefined}>
            {flags ? localeFlags[locale] : locale}
          </span>
          <span className="visually-hidden">{localeNames[locale]}</span>
        </Link>
      ))}
    </div>
  );
}
