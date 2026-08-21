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
 * FR-005: the switcher keeps the visitor on the same page. `usePathname` from
 * next-intl returns the internal pathname, so the localized segment
 * (/avis, /reviews, /bewertungen) is resolved by the Link itself, and the click
 * is handled as a client navigation: the section under the switcher is
 * re-rendered in the new language, the page is never fetched again from zero
 * and the scroll position is kept.
 */
export function LanguageSwitcher({ label, className = '', tone = 'light' }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const active = useLocale() as Locale;

  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<Locale | null>(null);
  const [flags, setFlags] = useState(false);
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  /** The pill leads, the content follows. */
  const selected = pending ?? active;

  useEffect(() => {
    setFlags(supportsFlagEmoji());
  }, []);

  // The navigation landed, so the optimistic choice is now the real one.
  useEffect(() => {
    setPending(null);
  }, [active]);

  useEffect(() => {
    let cancelled = false;

    const measure = () => {
      const track = trackRef.current;
      const option = track?.querySelector<HTMLElement>(`[data-locale="${selected}"]`);
      if (cancelled || !track || !option) return;
      setPill({ x: option.offsetLeft, width: option.offsetWidth });
    };

    measure();

    const observer = new ResizeObserver(measure);
    if (trackRef.current) observer.observe(trackRef.current);

    // A late web font changes the width of every option under the pill.
    document.fonts?.ready.then(measure).catch(() => {});

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [selected, flags]);

  const select = (event: MouseEvent<HTMLAnchorElement>, locale: Locale) => {
    // A middle click or a modified click still belongs to the browser.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    event.preventDefault();
    if (locale === active) return;

    setPending(locale);
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
          aria-current={locale === selected ? 'true' : undefined}
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
