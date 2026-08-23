import { useTranslations } from 'next-intl';
import { quickFacts } from '@/lib/content';

/**
 * FR-004: the reference's stat bar, in our own palette.
 *
 * Every cell is built the same way, a strong line and a quiet one, at the same
 * two sizes throughout. A fact carrying no number says its own words on the
 * strong line rather than being promoted to a bigger type than its neighbours,
 * which is what used to push the last two cells out of line with the first two.
 * The four strong lines therefore sit on one baseline.
 */
export function QuickFacts() {
  const t = useTranslations('quickFacts');

  return (
    <section aria-label={t('title')} className="border-y border-[rgba(58,42,38,0.1)] bg-sand">
      <div className="container-page">
        <dl className="grid grid-cols-2 divide-y divide-[rgba(58,42,38,0.1)] md:grid-cols-4 md:divide-x md:divide-y-0">
          {quickFacts.map((fact) => {
            const detail = t(`${fact.id}.detail`);

            return (
              <div key={fact.id} className="px-3 py-6 text-center md:px-6">
                <dt className="visually-hidden">{t(`${fact.id}.label`)}</dt>
                <dd>
                  <span className="block font-display text-2xl leading-tight md:text-3xl">
                    {/* Read only when there is no number to show. */}
                    {fact.value ?? t(`${fact.id}.lead`)}
                    {fact.unit ? (
                      <span className="text-[0.62em] text-ink-soft">{t(`unit.${fact.unit}`)}</span>
                    ) : null}
                  </span>
                  {detail ? (
                    <span className="mt-1.5 block text-sm text-ink-soft">{detail}</span>
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
