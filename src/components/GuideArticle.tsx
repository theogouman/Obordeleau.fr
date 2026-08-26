import { getTranslations } from 'next-intl/server';
import { AccentHeading } from '@/components/AccentHeading';
import { Section } from '@/components/Section';
import { SmartImage } from '@/components/SmartImage';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { quickFacts } from '@/lib/content';
import type { Guide } from '@/lib/guides';
import { allReviews, localize } from '@/lib/reviews';

/**
 * The shape all three guides share.
 *
 * A guide opens with its answer, not with a build up. The first block is
 * written to stand on its own: someone who reads only that paragraph, or an
 * assistant that quotes only that paragraph, still gets the whole answer with
 * the numbers in it. Everything after is the detail for whoever wants it.
 *
 * The quotations are real reviews, pulled by id and read in the language of
 * the page, so a German visitor gets the German reading of what a French guest
 * wrote. They are the part of these pages that no booking platform and no
 * tourist office can reproduce.
 */
export async function GuideArticle({ guide, locale }: { guide: Guide; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: `guides.${guide.id}` });
  const around = await getTranslations({ locale, namespace: 'around' });
  const gallery = await getTranslations({ locale, namespace: 'gallery' });
  const nav = await getTranslations({ locale, namespace: 'nav' });

  const quoted = guide.reviewIds
    .map((id) => allReviews.find((review) => review.id === id))
    .filter((review): review is NonNullable<typeof review> => Boolean(review))
    .map((review) => localize(review, locale));

  // The confirmed numbers, so the opening answer never drifts from the facts
  // the rest of the site is built on.
  const beach = quickFacts.find((fact) => fact.id === 'beach');

  return (
    <main id="main">
      <Section labelledBy="guide-title">
        <div className="max-w-3xl">
          <p className="text-sm uppercase tracking-[0.2em] text-ink-soft">{t('eyebrow')}</p>

          <AccentHeading
            as="h1"
            id="guide-title"
            lead={t('titleLead')}
            accent={t('titleAccent')}
            tail={t('titleTail')}
            className="mt-3 text-4xl md:text-6xl"
          />

          {/* The self contained answer. Kept first and kept short. */}
          <p className="lead mt-6 text-lg text-ink-soft">{t('answer')}</p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="max-w-2xl">
            {guide.sections.map((section) => (
              <section key={section} className="mt-8 first:mt-0">
                <h2 className="font-display text-2xl md:text-3xl">
                  {t(`sections.${section}.title`)}
                </h2>
                <p className="mt-3 text-ink-soft">{t(`sections.${section}.body`)}</p>
              </section>
            ))}

            {/* What the numbers are, in one place, for a reader in a hurry and
                for anything that quotes a passage rather than a page. */}
            <section className="mt-10">
              <h2 className="font-display text-2xl md:text-3xl">{t('factsTitle')}</h2>
              <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {['beach', 'boat', 'shops', 'parking'].map((fact) => (
                  <div key={fact} className="border-t border-[rgba(58,42,38,0.14)] pt-2">
                    <dt className="text-sm text-ink-soft">{t(`facts.${fact}.label`)}</dt>
                    <dd className="font-display text-lg">{t(`facts.${fact}.value`)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          <aside className="flex flex-col gap-6">
            <SmartImage
              src={`/images/area/${guide.photo}`}
              alt={around(guide.photoAlt.replace('around.', ''))}
              aspect="4 / 3"
              sizes="(min-width: 1024px) 38vw, 100vw"
              missingLabel={gallery('missing')}
            />

            {quoted.length > 0 ? (
              <div className="flex flex-col gap-4">
                <h2 className="font-display text-xl">{t('voicesTitle')}</h2>
                {quoted.map((review) => (
                  <figure
                    key={review.id}
                    className="rounded-[var(--radius-card)] border border-[rgba(58,42,38,0.14)] bg-shell p-5 shadow-[var(--shadow-card)]"
                  >
                    <blockquote className="text-ink-soft">{review.text}</blockquote>
                    <figcaption className="mt-3 text-sm text-ink-soft">
                      {review.firstName}
                    </figcaption>
                  </figure>
                ))}
                <Link href="/reviews" className="text-raspberry-ink hover:underline">
                  {t('allReviews')}
                </Link>
              </div>
            ) : null}
          </aside>
        </div>

        {/* One way on, and it is the booking form rather than another page. */}
        <div className="mt-12 flex flex-wrap items-center gap-4">
          <Link href={{ pathname: '/', hash: 'book' }} className="btn btn-primary">
            {nav('book')}
          </Link>
          <Link href="/" className="btn btn-secondary">
            {t('backHome')}
          </Link>
          {beach ? <p className="text-sm text-ink-soft">{t('closing')}</p> : null}
        </div>
      </Section>
    </main>
  );
}
