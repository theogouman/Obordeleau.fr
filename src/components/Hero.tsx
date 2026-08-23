import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { Icon } from '@/components/Icon';
import { assetExists } from '@/lib/assets';
import { property } from '@/lib/content';

/** Trois arches, une seule photographie. La geometrie est dans hero.css. */
const PANES = [0, 1, 2];

/**
 * FR-001 / FR-004: the hero carrying the core promise, with the primary Direct
 * call to action visible without scrolling.
 *
 * The photograph is the first one of the gallery, the wide view of the living
 * room, and it is shown through three arched openings rather than in a frame.
 * A wide picture in a single tall arch was cropped to a strip of itself; cut
 * the frame instead of the picture and the whole room stays on screen. The
 * arch is the brand mark: the wordmark is an arch over a waterline.
 *
 * Three images, one photograph. They carry the same src, the same sizes and
 * therefore the same optimized URL, so the browser fetches one file; each pane
 * shows its own third of it. The alternative text is on the triptych as a
 * whole, since it is one picture, and the fragments are silent.
 */
export function Hero() {
  const t = useTranslations('hero');
  const gallery = useTranslations('gallery');

  const photo = `/images/gallery/${property.hero.image}`;
  const available = assetExists(photo);

  return (
    <section className="hero relative overflow-hidden">
      <div className="hero__glow" aria-hidden="true" />

      <div className="container-page hero__grid">
        <div>
          {/* The place comes first, in a small framed tag rather than a bare line. */}
          <p className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[rgba(58,42,38,0.14)] bg-shell px-3 py-1.5 text-sm text-ink-soft shadow-[var(--shadow-card)]">
            <Icon name="location" className="h-3 w-auto shrink-0 text-raspberry" />
            {t('eyebrow')}
          </p>

          <AccentHeading
            as="h1"
            lead={t('titleLead')}
            accent={t('titleAccent')}
            tail={t('titleTail')}
            className="mt-4 text-4xl md:text-6xl"
          />

          <p className="lead mt-5 max-w-xl text-lg text-ink-soft">{t('subtitle')}</p>

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
          <div className="hero-triptych" role="img" aria-label={t('imageAlt')}>
            {PANES.map((pane) => (
              <div key={pane} className="hero-triptych__pane" data-pane={pane}>
                <div className="hero-triptych__frame">
                  {available ? (
                    <Image
                      src={photo}
                      alt=""
                      fill
                      priority={pane === 0}
                      sizes="(min-width: 1024px) 34rem, (min-width: 640px) 26rem, 100vw"
                      className="hero-triptych__img"
                    />
                  ) : null}
                </div>

                {!available && pane === 1 ? (
                  <span className="hero-triptych__missing">{gallery('missing')}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
