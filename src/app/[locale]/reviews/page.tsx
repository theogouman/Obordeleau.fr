import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AccentHeading } from '@/components/AccentHeading';
import { JsonLd } from '@/components/JsonLd';
import { GuestFavourite } from '@/components/GuestFavourite';
import { ReviewCard, type ReviewCardLabels } from '@/components/ReviewCard';
import { Section } from '@/components/Section';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { allReviews, hasReviews, reviewCount } from '@/lib/reviews';
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
    originalLanguage: t('card.originalLanguage', { language: '{language}' }),
    languageNames: {
      fr: t('languages.fr'),
      en: t('languages.en'),
      de: t('languages.de'),
      other: t('languages.other'),
    },
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
          <div className="max-w-2xl">
            <AccentHeading
              as="h1"
              id="reviews-page-title"
              lead={t('page.titleLead')}
              accent={t('page.titleAccent', { count: reviewCount })}
              tail={t('page.titleTail')}
              className="text-4xl md:text-6xl"
            />
            <p className="mt-4 text-lg text-ink-soft">{t('page.intro')}</p>
          </div>

          <GuestFavourite className="mt-10" />

          {hasReviews ? (
            <>
              {/* items-start, so opening one review grows that review and not
                  the whole row it happens to sit in. */}
              <ul className="mt-12 grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
                {allReviews.map((review) => (
                  <li key={review.id}>
                    <ReviewCard review={review} labels={labels} />
                  </li>
                ))}
              </ul>
            </>
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
