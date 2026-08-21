import Image from 'next/image';
import localFont from 'next/font/local';
import { useLocale, useTranslations } from 'next-intl';
import { localeTags, type Locale } from '@/i18n/routing';
import { averageRatingExact, reviewCount } from '@/lib/reviews';

/**
 * Airbnb prints this distinction in San Francisco, so the two faces the owner
 * supplied are used for the badge and for nothing else. They are not preloaded:
 * a decoration is not worth blocking the page for, and the fallback stack below
 * is metric compatible enough that the swap is barely visible.
 *
 * They live in src/fonts rather than in public: next/font hashes and serves
 * them itself, so a copy under public would be a second, unused download path.
 * The lowercase extension is not cosmetic either, next/font matches it exactly.
 *
 * Both are cut down to the Latin the three languages actually use and repacked
 * as woff2, which takes the pair from 655 kB to 53 kB. The originals are not
 * kept in the repository: they came from the owner and the badge is the only
 * thing that ever needed them.
 */
const sanFrancisco = localFont({
  src: [
    { path: '../fonts/sf-pro-display-medium.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/sf-pro-display-bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-sf',
  display: 'swap',
  preload: false,
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica Neue', 'sans-serif'],
});

/**
 * The guest favourite distinction, laid out the way Airbnb lays it out: the
 * score alone between the two laurel branches, the title under it, the
 * explanation under that, the whole thing centred.
 *
 * The score is the real average of the reviews carried by the site, to two
 * decimals, and it is read out with its scale rather than as a bare number.
 */
export function GuestFavourite({ className = '' }: { className?: string }) {
  const t = useTranslations('reviews.favourite');
  const badge = useTranslations('reviews.badge');
  const locale = useLocale() as Locale;

  if (reviewCount === 0) return null;

  const score = averageRatingExact.toLocaleString(localeTags[locale], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <section
      aria-label={t('title')}
      className={`${sanFrancisco.variable} guest-favourite ${className}`}
    >
      <p className="guest-favourite__score">
        <Image
          src="/images/annexes/laurel-left.png"
          alt=""
          width={1024}
          height={1536}
          sizes="(min-width: 768px) 76px, 60px"
          className="guest-favourite__laurel"
        />
        <span aria-label={badge('ratingLabel', { rating: score })}>{score}</span>
        <Image
          src="/images/annexes/laurel-right.png"
          alt=""
          width={1024}
          height={1536}
          sizes="(min-width: 768px) 76px, 60px"
          className="guest-favourite__laurel"
        />
      </p>

      <p className="guest-favourite__title">{t('title')}</p>
      <p className="guest-favourite__body">{t('body')}</p>
    </section>
  );
}
