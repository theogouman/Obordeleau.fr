import { useTranslations } from 'next-intl';
import { quickFacts } from '@/lib/content';

/** FR-004: the reference's stat / quick facts bar, in our own palette. */
export function QuickFacts() {
  const t = useTranslations('quickFacts');

  return (
    <section aria-label={t('title')} className="border-y border-[rgba(58,42,38,0.1)] bg-sand">
      <div className="container-page">
        <dl className="grid grid-cols-2 divide-y divide-[rgba(58,42,38,0.1)] md:grid-cols-4 md:divide-x md:divide-y-0">
          {quickFacts.map((fact) => (
            <div key={fact.id} className="px-2 py-6 text-center md:px-6">
              <dt className="visually-hidden">{t(`${fact.id}.label`)}</dt>
              <dd>
                <span className="block font-display text-3xl md:text-4xl">
                  {fact.value}
                  {fact.unit ? (
                    <span className="text-2xl text-ink-soft">{t(`unit.${fact.unit}`)}</span>
                  ) : null}
                </span>
                <span className="mt-1 block text-sm font-medium">{t(`${fact.id}.label`)}</span>
                <span className="mt-0.5 block text-sm text-ink-soft">{t(`${fact.id}.detail`)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
