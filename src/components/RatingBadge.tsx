import { useLocale, useTranslations } from 'next-intl';
import { Stars } from '@/components/Stars';
import { localeTags, type Locale } from '@/i18n/routing';
import { averageRating, reviewCount } from '@/lib/reviews';

/** FR-008: "about 4.9 / 5, 165 reviews", computed from the data at build time. */
export function RatingBadge({ className = '' }: { className?: string }) {
  const t = useTranslations('reviews.badge');
  const locale = useLocale() as Locale;

  if (reviewCount === 0) return null;

  const rating = averageRating.toLocaleString(localeTags[locale], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <p
      className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-pill)] border border-[rgba(58,42,38,0.14)] bg-shell px-4 py-2 ${className}`}
      aria-label={t('aria', { rating, count: reviewCount })}
    >
      <Stars rating={averageRating} label="" className="translate-y-[1px]" />
      <span aria-hidden="true" className="font-display text-lg">
        {t('about')} {t('ratingLabel', { rating })}
      </span>
      <span aria-hidden="true" className="text-ink-soft">
        {t('countLabel', { count: reviewCount })}
      </span>
    </p>
  );
}
