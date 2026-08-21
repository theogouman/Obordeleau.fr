import { useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { RatingBadge } from '@/components/RatingBadge';
import { ReviewCard, type ReviewCardLabels } from '@/components/ReviewCard';
import { Reveal } from '@/components/Reveal';
import { Section } from '@/components/Section';
import { Link } from '@/i18n/navigation';
import { curatedReviews, hasReviews, reviewCount } from '@/lib/reviews';

export function useReviewCardLabels(): ReviewCardLabels {
  const t = useTranslations('reviews');
  return {
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
}

/** FR-008: rating badge plus the curated, location forward selection. */
export function ReviewsSection() {
  const t = useTranslations('reviews');
  const labels = useReviewCardLabels();
  const reviews = curatedReviews();

  return (
    <Section id="reviews" labelledBy="reviews-title">
      <Reveal className="max-w-2xl">
        <AccentHeading
          id="reviews-title"
          lead={t('titleLead')}
          accent={t('titleAccent')}
          tail={t('titleTail')}
        />
        <RatingBadge className="mt-6" />
      </Reveal>

      {hasReviews ? (
        <>
          <ul className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review, index) => (
              <li key={review.id}>
                <Reveal delay={index * 60} className="h-full">
                  <ReviewCard review={review} labels={labels} />
                </Reveal>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <Link href="/reviews" className="btn btn-secondary">
              {t('seeAll', { count: reviewCount })}
            </Link>
          </div>
        </>
      ) : (
        <p className="mt-8 rounded-[var(--radius-card)] border border-dashed border-[rgba(58,42,38,0.25)] p-6 text-ink-soft">
          {t('empty')}
        </p>
      )}
    </Section>
  );
}
