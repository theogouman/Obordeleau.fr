import { useTranslations } from 'next-intl';
import { quickFacts } from '@/lib/content';

/**
 * FR-004: the reference's stat / quick facts bar, in our own palette.
 * A fact with no numeric value promotes its label to the display line, so
 * "Tout equipe" reads as strongly as "33 m2".
 */
export function QuickFacts() {
  const t = useTranslations('quickFacts');

  return (
    <section aria-label={t('title')} className="border-y border-[rgba(58,42,38,0.1)] bg-sand">
      <div className="container-page">
        <dl className="grid grid-cols-2 divide-y divide-[rgba(58,42,38,0.1)] md:grid-cols-4 md:divide-x md:divide-y-0">
          {quickFacts.map((fact) => {
            const label = t(`${fact.id}.label`);
            const detail = t(`${fact.id}.detail`);

            return (
              <div key={fact.id} className="px-2 py-6 text-center md:px-6">
                <dt className="visually-hidden">{label}</dt>
                <dd>
                  {fact.value ? (
                    <>
                      <span className="block font-display text-3xl md:text-4xl">
                        {fact.value}
                        {fact.unit ? (
                          <span className="text-2xl text-ink-soft">{t(`unit.${fact.unit}`)}</span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-sm font-medium">{label}</span>
                    </>
                  ) : (
                    <span className="block font-display text-2xl md:text-3xl">{label}</span>
                  )}
                  {detail ? (
                    <span className="mt-0.5 block text-sm text-ink-soft">{detail}</span>
                  ) : null}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
