import { useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { Reveal } from '@/components/Reveal';
import { Section } from '@/components/Section';
import { amenitiesByGroup, amenityGroups } from '@/lib/content';

export function Amenities() {
  const t = useTranslations('amenities');

  return (
    <Section id="amenities" muted labelledBy="amenities-title">
      <Reveal className="max-w-2xl">
        <AccentHeading
          id="amenities-title"
          lead={t('titleLead')}
          accent={t('titleAccent')}
          tail={t('titleTail')}
        />
        <p className="lead mt-4 text-lg text-ink-soft">{t('intro')}</p>
      </Reveal>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {amenityGroups.map((group, groupIndex) => {
          const items = amenitiesByGroup(group);
          if (items.length === 0) return null;

          return (
            <Reveal key={group} delay={groupIndex * 80}>
              <div className="card h-full p-6">
                <h3 className="font-display text-xl">{t(`groups.${group}`)}</h3>
                <ul className="mt-4 space-y-3">
                  {items.map((item) => {
                    const note = t(`items.${item.id}.note`);
                    return (
                      <li key={item.id} className="flex gap-3">
                        <svg
                          viewBox="0 0 20 20"
                          width="18"
                          height="18"
                          aria-hidden="true"
                          focusable="false"
                          className="mt-1 shrink-0"
                        >
                          <path
                            d="M4 10.5l4 4 8-9"
                            fill="none"
                            stroke="var(--color-raspberry)"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span>
                          <span className="font-medium">{t(`items.${item.id}.label`)}</span>
                          {note ? (
                            <span className="block text-sm text-ink-soft">{note}</span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Reveal>
          );
        })}
      </div>

    </Section>
  );
}
