import { useLocale, useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { GuestFavourite } from '@/components/GuestFavourite';
import { ReviewCard, type ReviewCardLabels } from '@/components/ReviewCard';
import { Reveal } from '@/components/Reveal';
import { ReviewsCta } from '@/components/ReviewsCta';
import { Section } from '@/components/Section';
import type { Locale } from '@/i18n/routing';
import { curatedReviews, hasReviews, localizeAll } from '@/lib/reviews';

export function useReviewCardLabels(): ReviewCardLabels {
  const t = useTranslations('reviews');
  return {
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
}

/** FR-008: the distinction, then the curated, location forward selection. */
export function ReviewsSection() {
  const t = useTranslations('reviews');
  const locale = useLocale() as Locale;
  const labels = useReviewCardLabels();
  // More than the wall can show at any width: the cut has to land inside the
  // cards, never past the end of a column. Read in the page's language here,
  // on the server, so a card is handed one reading and not four.
  const reviews = localizeAll(curatedReviews(12), locale);

  return (
    <Section id="reviews" labelledBy="reviews-title">
      {/* The heading and the distinction share one line on a wide screen,
          centred on each other, and stack on a narrow one. The rating pill that
          used to sit under the heading said the same thing in figures, one line
          below the thing that says it with its name. */}
      <Reveal>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-14">
          <div className="max-w-2xl">
            <AccentHeading
              id="reviews-title"
              lead={t('titleLead')}
              accent={t('titleAccent')}
              tail={t('titleTail')}
            />

            {/* The same sentence the reviews page opens with, from the same
                key: it is the same promise, and it should not be possible to
                change it in one place and not the other. Two lines here, which
                is the lead rule doing its work, and it is what squares the
                block off against the distinction beside it. */}
            <p className="lead mt-4 text-lg text-ink-soft">{t('page.intro')}</p>
          </div>

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
