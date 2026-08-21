'use client';

import NextLink from 'next/link';
import { useLocale } from 'next-intl';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { getPathname, Link, usePathname } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Wordmark } from '@/components/Wordmark';
import type { Locale } from '@/i18n/routing';

export type HeaderLabels = {
  home: string;
  gallery: string;
  amenities: string;
  around: string;
  about: string;
  reviews: string;
  location: string;
  book: string;
  openMenu: string;
  closeMenu: string;
  language: string;
  primary: string;
  mobileMenu: string;
};

type Props = {
  labels: HeaderLabels;
};

/**
 * The same five sections wherever the visitor is. On the home page they are
 * anchors into the page; elsewhere they are client navigations to the home
 * page carrying the anchor, which Next then scrolls to.
 *
 * Declared here rather than inside Header: a component built during a render
 * is a new type on every render, and React would tear the whole nav down and
 * build it again each time the menu opened.
 */
function SectionLink({
  hash,
  className,
  children,
  atHome,
  home,
  onNavigate,
}: {
  hash: string;
  className: string;
  children: ReactNode;
  atHome: boolean;
  home: string;
  onNavigate: () => void;
}) {
  if (atHome) {
    return (
      <a href={hash} onClick={onNavigate} className={className}>
        {children}
      </a>
    );
  }

  return (
    <NextLink href={`${home}${hash}`} onClick={onNavigate} className={className}>
      {children}
    </NextLink>
  );
}

export function Header({ labels }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const locale = useLocale() as Locale;

  // On the home page the nav scrolls to sections, elsewhere it links back.
  // Read from the route rather than passed down, now that the header is
  // mounted once by the layout instead of once by each page.
  const variant = pathname === '/' ? 'home' : 'inner';

  // The header no longer unmounts between pages, so the open menu has to be
  // closed by hand when a link inside it lands somewhere else.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const sections = [
    { hash: '#gallery', label: labels.gallery },
    { hash: '#amenities', label: labels.amenities },
    { hash: '#around', label: labels.around },
    { hash: '#reviews', label: labels.reviews },
    { hash: '#location', label: labels.location },
  ];

  // The localized home page, so a section of it can be reached from anywhere.
  const home = getPathname({ href: '/', locale });

  // The three props every section link shares.
  const shared = { atHome: variant === 'home', home, onNavigate: () => setOpen(false) };

  /**
   * The page is already loaded, so going back to the top is a scroll and not a
   * navigation. Without this the browser reloads the document, which is the
   * jump the owner saw.
   */
  function toTop(event: MouseEvent<HTMLAnchorElement>) {
    if (variant !== 'home') return;
    event.preventDefault();
    setOpen(false);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(58,42,38,0.08)] bg-[rgba(250,247,242,0.92)] backdrop-blur">
      <div className="container-page flex items-center justify-between gap-4 py-3">
        {/* An anchor either way, so it still works with no JavaScript. */}
        {variant === 'home' ? (
          <a href={home} onClick={toTop} className="text-ink" aria-label={labels.home}>
            <Wordmark />
          </a>
        ) : (
          <Link href="/" className="text-ink" aria-label={labels.home}>
            <Wordmark />
          </Link>
        )}

        <nav aria-label={labels.primary} className="hidden items-center gap-6 text-sm lg:flex">
          {sections.map((item) => (
            <SectionLink
              key={item.hash}
              {...shared}
              hash={item.hash}
              className="text-ink-soft transition-colors hover:text-ink"
            >
              {item.label}
            </SectionLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher label={labels.language} className="hidden sm:flex" />
          <SectionLink
            {...shared}
            hash="#book"
            className="btn btn-primary hidden px-4 py-2 text-sm sm:inline-flex"
          >
            {labels.book}
          </SectionLink>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="inline-flex items-center justify-center rounded-[var(--radius-pill)] border border-[rgba(58,42,38,0.2)] p-2 lg:hidden"
          >
            <span className="visually-hidden">{open ? labels.closeMenu : labels.openMenu}</span>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              {open ? (
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Menu dropdown, height animated through the shared motion tokens. */}
      <div
        id="mobile-menu"
        hidden={!open}
        className="border-t border-[rgba(58,42,38,0.08)] bg-cream lg:hidden"
      >
        <nav aria-label={labels.mobileMenu} className="container-page flex flex-col gap-1 py-4">
          {sections.map((item) => (
            <SectionLink
              key={item.hash}
              {...shared}
              hash={item.hash}
              className="rounded-[var(--radius-card)] px-2 py-3 text-ink-soft hover:bg-sand hover:text-ink"
            >
              {item.label}
            </SectionLink>
          ))}

          <div className="mt-2 flex items-center justify-between gap-3 border-t border-[rgba(58,42,38,0.08)] pt-4">
            <LanguageSwitcher label={labels.language} />
            <SectionLink {...shared} hash="#book" className="btn btn-primary px-4 py-2 text-sm">
              {labels.book}
            </SectionLink>
          </div>
        </nav>
      </div>
    </header>
  );
}
