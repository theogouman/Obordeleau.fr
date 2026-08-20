import { useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { Reveal } from '@/components/Reveal';
import { Section } from '@/components/Section';
import { amenitiesByGroup, amenityGroups, honestNotes } from '@/lib/content';

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
        <p className="mt-4 text-lg text-ink-soft">{t('intro')}</p>
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

      {honestNotes.length > 0 ? (
        <Reveal className="mt-10">
          <details className="card group overflow-hidden p-0">
            <summary className="flex cursor-pointer items-center justify-between gap-4 p-6 font-display text-xl">
              {t('honest.title')}
              <svg
                viewBox="0 0 20 20"
                width="20"
                height="20"
                aria-hidden="true"
                focusable="false"
                className="shrink-0 transition-transform duration-[var(--duration-base)] group-open:rotate-45"
              >
                <path
                  d="M10 4v12M4 10h12"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </summary>
            <div className="px-6 pb-6">
              <p className="text-ink-soft">{t('honest.intro')}</p>
              <ul className="mt-4 space-y-3">
                {honestNotes.map((note) => (
                  <li key={note} className="border-l-2 border-sunset pl-4">
                    {t(`honest.notes.${note}`)}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </Reveal>
      ) : null}
    </Section>
  );
}
