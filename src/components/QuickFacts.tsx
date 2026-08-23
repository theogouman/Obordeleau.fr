import { useTranslations } from 'next-intl';
import { quickFacts } from '@/lib/content';

/**
 * FR-004: the four things worth knowing before scrolling, as four sentences.
 *
 * No fact is ranked above another. The bar used to set its numbers in large
 * display type with their words beneath, which gave the two facts that have no
 * number nothing to set large and left them out of step with their neighbours.
 * Each cell is now one sentence, at one size, and the numbers are read inside
 * their sentence rather than announced above it. They still come from
 * `property.json`, filled into the sentence at render, so the copy holds no
 * measurement of its own.
 */
export function QuickFacts() {
  const t = useTranslations('quickFacts');

  return (
    <section aria-label={t('title')} className="border-y border-[rgba(58,42,38,0.1)] bg-sand">
      <div className="container-page">
        <ul className="grid grid-cols-2 divide-y divide-[rgba(58,42,38,0.1)] md:grid-cols-4 md:divide-x md:divide-y-0">
          {quickFacts.map((fact) => (
            <li
              key={fact.id}
              className="flex min-h-[4.5rem] items-center justify-center px-4 py-5 text-center text-[0.9375rem] leading-snug text-ink md:px-6 md:text-base"
            >
              {t(`${fact.id}.text`, {
                value: fact.value ?? '',
                unit: fact.unit ? t(`unit.${fact.unit}`) : '',
              })}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
