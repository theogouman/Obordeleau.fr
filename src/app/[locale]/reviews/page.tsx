import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AccentHeading } from '@/components/AccentHeading';
import { JsonLd } from '@/components/JsonLd';
import { GuestFavourite } from '@/components/GuestFavourite';
import { type ReviewCardLabels } from '@/components/ReviewCard';
import { ReviewsBrowser, type ReviewFilterLabels } from '@/components/ReviewsBrowser';
import { Section } from '@/components/Section';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { allReviews, hasReviews, localizeAll, reviewCount } from '@/lib/reviews';
import { buildMetadata } from '@/lib/seo';
import { breadcrumbJsonLd } from '@/lib/structured-data';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  return buildMetadata({
    locale,
    pathname: '/reviews',
    title: t('reviews.title'),
    description: t('reviews.description'),
    siteName: t('siteName'),
  });
}

/** FR-009: every review, newest first, nothing filtered out. */
export default async function ReviewsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'reviews' });
  const nav = await getTranslations({ locale, namespace: 'nav' });
  const meta = await getTranslations({ locale, namespace: 'meta' });

  const labels: ReviewCardLabels = {
    ratingAria: t('card.ratingAria', { rating: '{rating}' }),
    readMore: t('card.readMore'),
    readLess: t('card.readLess'),
    translatedFrom: {
      fr: t('card.translatedFrom.fr'),
      en: t('card.translatedFrom.en'),
      de: t('card.translatedFrom.de'),
      it: t('card.translatedFrom.it'),
      other: t('card.translatedFrom.other'),
    },
    stayTooltip: t('card.stayTooltip', {
      name: '{name}',
      rating: '{rating}',
      source: '{source}',
      month: '{month}',
    }),
    sourceNames: {
      airbnb: t('filters.airbnb'),
      booking: t('filters.booking'),
    },
  };

  const filters: ReviewFilterLabels = {
    legend: t('filters.legend'),
    recent: t('filters.recent'),
    lowest: t('filters.lowest'),
    highest: t('filters.highest'),
    platform: t('filters.platform'),
    platformMenu: t('filters.platformMenu'),
    platformOpen: t('filters.platformOpen'),
    from: t('filters.from'),
    or: t('filters.or'),
    airbnb: t('filters.airbnb'),
    booking: t('filters.booking'),
    clear: t('filters.clear'),
    result: t('filters.result', { count: '{count}' }),
    empty: t('filters.empty'),
  };

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd(locale, [
          { name: meta('siteName'), pathname: '/' },
          { name: nav('reviews'), pathname: '/reviews' },
        ])}
      />

      <main id="main">
        <Section labelledBy="reviews-page-title">
          {/* The title and the distinction share one line on a wide screen,
              centred on each other, and stack on a narrow one. */}
          <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-14">
            <div className="max-w-2xl">
              <AccentHeading
                as="h1"
                id="reviews-page-title"
                lead={t('page.titleLead')}
                accent={t('page.titleAccent', { count: reviewCount })}
                tail={t('page.titleTail')}
                className="text-4xl md:text-6xl"
              />
              <p className="lead mt-4 text-lg text-ink-soft">{t('page.intro')}</p>
            </div>

            <GuestFavourite className="lg:shrink-0" />
          </div>

          {hasReviews ? (
            /* Three columns that are containers of their own: opening a review
               pushes down the ones under it in that column, and leaves both
               the other columns untouched. The filters, the order and the move
               from one order to the next belong to the browser. */
            <ReviewsBrowser reviews={localizeAll(allReviews, locale)} labels={labels} filters={filters} />
          ) : (
            <p className="mt-8 rounded-[var(--radius-card)] border border-dashed border-[rgba(58,42,38,0.25)] p-6 text-ink-soft">
              {t('empty')}
            </p>
          )}

          <div className="mt-10">
            <Link href="/" className="btn btn-secondary">
              {t('page.backHome')}
            </Link>
          </div>
        </Section>
      </main>
    </>
  );
}
