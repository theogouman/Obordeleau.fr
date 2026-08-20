import { useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { Reveal } from '@/components/Reveal';
import { SmartImage } from '@/components/SmartImage';
import { property } from '@/lib/content';
import { heroQuotes } from '@/lib/reviews';

/**
 * FR-001 / FR-004: arched hero carrying the core promise, with the primary
 * Direct call to action visible without scrolling.
 */
export function Hero() {
  const t = useTranslations('hero');
  const gallery = useTranslations('gallery');
  const quotes = heroQuotes();

  return (
    <section className="relative overflow-hidden pb-4 pt-10 md:pt-16">
      <div className="container-page grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-ink-soft">{t('eyebrow')}</p>

          <AccentHeading
            as="h1"
            lead={t('titleLead')}
            accent={t('titleAccent')}
            tail={t('titleTail')}
            className="mt-4 text-4xl md:text-6xl"
          />

          <p className="mt-5 max-w-xl text-lg text-ink-soft">{t('subtitle')}</p>

          <p className="mt-5 inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[rgba(206,66,87,0.35)] px-3 py-1 text-sm text-raspberry-ink">
            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8z"
              />
            </svg>
            {t('badge')}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#book" className="btn btn-primary">
              {t('ctaPrimary')}
            </a>
            <a href="#gallery" className="btn btn-secondary">
              {t('ctaSecondary')}
            </a>
          </div>
        </div>

        <div>
          <SmartImage
            src={`/images/hero/${property.hero.image}`}
            alt={t('imageAlt')}
            aspect="3 / 4"
            priority
            sizes="(min-width: 1024px) 45vw, 100vw"
            rounded="arch"
            missingLabel={gallery('missing')}
            className="mx-auto max-w-md"
          />
        </div>
      </div>

      {quotes.length > 0 ? (
        <div className="container-page mt-12">
          <h2 className="text-sm uppercase tracking-[0.2em] text-ink-soft">{t('quotesLabel')}</h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            {quotes.map((quote, index) => (
              <li key={quote.id}>
                <Reveal delay={index * 80}>
                  <figure className="h-full rounded-[var(--radius-card)] border-l-2 border-coral bg-[rgba(255,255,255,0.6)] px-4 py-3">
                    <blockquote className="font-display text-lg italic leading-snug">
                      {shortQuote(quote.text)}
                    </blockquote>
                    <figcaption className="mt-2 text-sm text-ink-soft">
                      {quote.firstName}
                      {quote.dateLabel ? `, ${quote.dateLabel}` : ''}
                    </figcaption>
                  </figure>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** Hero quotes stay short: first sentence, capped, never mid word. */
function shortQuote(text: string): string {
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  if (firstSentence.length <= 120) return firstSentence;
  const cut = firstSentence.slice(0, 117);
  return `${cut.slice(0, cut.lastIndexOf(' '))}...`;
}
