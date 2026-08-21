'use client';

import { useEffect, useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Wordmark } from '@/components/Wordmark';

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

export function Header({ labels }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
    { href: '#gallery', label: labels.gallery },
    { href: '#amenities', label: labels.amenities },
    { href: '#around', label: labels.around },
    { href: '#reviews', label: labels.reviews },
    { href: '#location', label: labels.location },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(58,42,38,0.08)] bg-[rgba(250,247,242,0.92)] backdrop-blur">
      <div className="container-page flex items-center justify-between gap-4 py-3">
        <Link href="/" className="text-ink" aria-label={labels.home}>
          <Wordmark />
        </Link>

        <nav aria-label={labels.primary} className="hidden items-center gap-6 text-sm lg:flex">
          {variant === 'home' ? (
            sections.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-ink-soft transition-colors hover:text-ink"
              >
                {item.label}
              </a>
            ))
          ) : (
            <>
              <Link href="/" className="text-ink-soft transition-colors hover:text-ink">
                {labels.home}
              </Link>
              <Link href="/reviews" className="text-ink-soft transition-colors hover:text-ink">
                {labels.reviews}
              </Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher label={labels.language} className="hidden sm:flex" />
          {variant === 'home' ? (
            <a href="#book" className="btn btn-primary hidden px-4 py-2 text-sm sm:inline-flex">
              {labels.book}
            </a>
          ) : (
            <Link href="/" className="btn btn-primary hidden px-4 py-2 text-sm sm:inline-flex">
              {labels.book}
            </Link>
          )}

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
          {variant === 'home' ? (
            sections.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-[var(--radius-card)] px-2 py-3 text-ink-soft hover:bg-sand hover:text-ink"
              >
                {item.label}
              </a>
            ))
          ) : (
            <>
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="rounded-[var(--radius-card)] px-2 py-3 text-ink-soft hover:bg-sand hover:text-ink"
              >
                {labels.home}
              </Link>
              <Link
                href="/reviews"
                onClick={() => setOpen(false)}
                className="rounded-[var(--radius-card)] px-2 py-3 text-ink-soft hover:bg-sand hover:text-ink"
              >
                {labels.reviews}
              </Link>
            </>
          )}

          <div className="mt-2 flex items-center justify-between gap-3 border-t border-[rgba(58,42,38,0.08)] pt-4">
            <LanguageSwitcher label={labels.language} />
            {variant === 'home' ? (
              <a
                href="#book"
                onClick={() => setOpen(false)}
                className="btn btn-primary px-4 py-2 text-sm"
              >
                {labels.book}
              </a>
            ) : (
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="btn btn-primary px-4 py-2 text-sm"
              >
                {labels.book}
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
