import { useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { GuestFavourite } from '@/components/GuestFavourite';
import { ReviewCard, type ReviewCardLabels } from '@/components/ReviewCard';
import { Reveal } from '@/components/Reveal';
import { ReviewsCta } from '@/components/ReviewsCta';
import { Section } from '@/components/Section';
import { curatedReviews, hasReviews } from '@/lib/reviews';

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
}

/** FR-008: the distinction, then the curated, location forward selection. */
export function ReviewsSection() {
  const t = useTranslations('reviews');
  const labels = useReviewCardLabels();
  // More than the wall can show at any width: the cut has to land inside the
  // cards, never past the end of a column.
  const reviews = curatedReviews(12);

  return (
    <Section id="reviews" labelledBy="reviews-title">
      {/* The heading and the distinction share one line on a wide screen,
          centred on each other, and stack on a narrow one. The rating pill that
          used to sit under the heading said the same thing in figures, one line
          below the thing that says it with its name. */}
      <Reveal>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-14">
          <AccentHeading
            id="reviews-title"
            lead={t('titleLead')}
            accent={t('titleAccent')}
            tail={t('titleTail')}
            className="max-w-2xl"
          />

          <GuestFavourite className="lg:shrink-0" />
        </div>
      </Reveal>

      {hasReviews ? (
        <>
          {/* Columns, not a grid: the cards close up under each other whatever
              their length. The wall is cut at a fixed height and dissolved into
              the page by reviews.css. */}
          <div className="reviews-veil mt-10">
            <ul className="reviews-wall">
              {reviews.map((review, index) => (
                <li key={review.id}>
                  <Reveal delay={index * 60}>
                    <ReviewCard review={review} labels={labels} teaser />
                  </Reveal>
                </li>
              ))}
            </ul>

            <div className="reviews-veil__blur" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>

          {/* Up in the tail of the gradient, where the reading stops, rather
              than under the cut, which is a good deal lower. */}
          <div className="-mt-12 flex justify-center md:-mt-14">
            <ReviewsCta lead={t('cta.lead')} main={t('cta.main')} />
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
