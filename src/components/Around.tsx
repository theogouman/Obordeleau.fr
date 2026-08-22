import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { AroundStack } from '@/components/AroundStack';
import { Icon } from '@/components/Icon';
import { Reveal } from '@/components/Reveal';
import { Section } from '@/components/Section';
import { assetExists } from '@/lib/assets';
import { aroundItems, property } from '@/lib/content';

/**
 * FR-004: the "around you" block, as a pile of cards that builds up while the
 * section is scrolled through. The movement lives in AroundStack; everything
 * here stays on the server, so the cards and their text are in the document
 * before a single line of script runs, and the presence of a photograph is
 * still resolved at build time by assetExists.
 *
 * No distance or walking time on the cards. A place a minute away says so in
 * its own sentence, and a badge repeating it in figures was one measurement
 * too many for a block whose point is that nothing here needs measuring.
 *
 * Three of the four carry a photograph. A card without one is not a hole: it
 * is laid out for its words, on the sunset ground, with the place mark the
 * rest of the site uses. Dropping a file in public/images/area and naming it
 * in content/property.json under `area` is all it takes to turn any of them
 * into a photograph card, and the only other thing it needs is a photoAlt in
 * each of the four catalogues.
 */
export function Around() {
  const t = useTranslations('around');

  const photos = new Map(property.area.map((image) => [image.aroundId, image.file]));

  return (
    <Section id="around" labelledBy="around-title">
      <AroundStack
        header={
          <Reveal className="max-w-2xl">
            <AccentHeading
              id="around-title"
              lead={t('titleLead')}
              accent={t('titleAccent')}
              tail={t('titleTail')}
            />
            <p className="lead mt-4 text-lg text-ink-soft">{t('intro')}</p>
          </Reveal>
        }
      >
        {aroundItems.map((item, index) => {
          const file = photos.get(item.id);
          const source = file ? `/images/area/${file}` : null;
          const photo = source && assetExists(source) ? source : null;

          return (
            <article
              key={item.id}
              className={`around-card ${photo ? 'around-card--photo' : 'around-card--plain'}`}
            >
              <div className="around-card__grid">
                <div className="around-card__body">
                  {photo ? null : <Icon name="location" className="around-card__mark" />}

                  <span className="around-card__num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3 className="around-card__title">{t(`items.${item.id}.label`)}</h3>
                  <p className="around-card__detail">{t(`items.${item.id}.detail`)}</p>
                </div>

                {photo ? (
                  <div className="around-card__visual">
                    <Image
                      src={photo}
                      alt={t(`items.${item.id}.photoAlt`)}
                      fill
                      sizes="(min-width: 768px) 45vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </AroundStack>
    </Section>
  );
}
