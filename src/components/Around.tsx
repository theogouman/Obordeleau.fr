import { useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { Reveal } from '@/components/Reveal';
import { Section } from '@/components/Section';
import { SmartImage } from '@/components/SmartImage';
import { aroundItems, property } from '@/lib/content';

/** FR-004: the "around you" distances block. */
export function Around() {
  const t = useTranslations('around');
  const gallery = useTranslations('gallery');

  return (
    <Section id="around" labelledBy="around-title">
      <Reveal className="max-w-2xl">
        <AccentHeading
          id="around-title"
          lead={t('titleLead')}
          accent={t('titleAccent')}
          tail={t('titleTail')}
        />
        <p className="mt-4 text-lg text-ink-soft">{t('intro')}</p>
      </Reveal>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_0.8fr]">
        <Reveal>
          <ul className="divide-y divide-[rgba(58,42,38,0.12)]">
            {aroundItems.map((item) => {
              const measures: string[] = [];
              if (item.distanceM !== null) {
                measures.push(t('unit.distance', { value: item.distanceM }));
              }
              if (item.walkMinutes !== null) {
                measures.push(t('unit.walk', { value: item.walkMinutes }));
              }
              if (measures.length === 0) measures.push(t('unit.onFoot'));

              return (
                <li key={item.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4">
                  <h3 className="font-display text-xl">{t(`items.${item.id}.label`)}</h3>
                  <p className="order-3 w-full text-ink-soft">{t(`items.${item.id}.detail`)}</p>
                  <p className="ms-auto whitespace-nowrap rounded-[var(--radius-pill)] bg-sand px-3 py-1 text-sm font-medium">
                    {measures.join(', ')}
                  </p>
                </li>
              );
            })}
          </ul>
        </Reveal>

        <Reveal delay={100}>
          <div className="grid gap-4">
            {property.area.map((image) => (
              <SmartImage
                key={image.file}
                src={`/images/area/${image.file}`}
                alt={t(`items.${image.aroundId}.photoAlt`)}
                aspect="16 / 10"
                sizes="(min-width: 1024px) 30vw, 100vw"
                missingLabel={gallery('missing')}
              />
            ))}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
