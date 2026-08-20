'use client';

import { useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { localeNames, routing, type Locale } from '@/i18n/routing';

type Props = {
  label: string;
  className?: string;
  /** The footer sits on the dark ink background. */
  tone?: 'light' | 'dark';
};

/**
 * FR-005: the switcher keeps the visitor on the same page. `usePathname` from
 * next-intl returns the internal pathname, so the localized segment
 * (/avis, /reviews, /bewertungen) is resolved by the Link itself.
 */
export function LanguageSwitcher({ label, className = '', tone = 'light' }: Props) {
  const pathname = usePathname();
  const active = useLocale() as Locale;

  return (
    <div role="group" aria-label={label} className={`flex items-center gap-1 ${className}`}>
      {routing.locales.map((locale) => {
        const isActive = locale === active;
        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            hrefLang={locale}
            aria-current={isActive ? 'true' : undefined}
            className={`rounded-[var(--radius-pill)] px-2.5 py-1 text-sm uppercase tracking-wide transition-colors ${
              isActive
                ? tone === 'dark'
                  ? 'bg-cream text-night'
                  : 'bg-ink text-cream'
                : tone === 'dark'
                  ? 'text-cream/70 hover:bg-cream/10 hover:text-cream'
                  : 'text-ink-soft hover:bg-[rgba(58,42,38,0.08)] hover:text-ink'
            }`}
          >
            <span aria-hidden="true">{locale}</span>
            <span className="visually-hidden">{localeNames[locale]}</span>
          </Link>
        );
      })}
    </div>
  );
}
