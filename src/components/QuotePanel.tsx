'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { localeTags, type Locale } from '@/i18n/routing';
import type { Quote } from '@/lib/pricing';

/**
 * What the stay costs, as the database worked it out.
 *
 * Not one figure here is added up in the browser. Every line is a field of the
 * quote returned by get_quote, which is also where the amount charged will come
 * from, so what the visitor reads and what is taken cannot drift apart.
 *
 * Cleaning at zero is not a zero on a line. It is offered, and it says so:
 * a nought next to "ménage" reads as a missing price, not as a gift.
 */
export function QuotePanel({ quote }: { quote: Quote }) {
  const t = useTranslations('reservation.booking.quote');
  const localeTag = localeTags[useLocale() as Locale];

  // Rendered only after the quote has been fetched, so this never runs during
  // server rendering and cannot produce a hydration mismatch.
  const money = useMemo(
    () =>
      new Intl.NumberFormat(localeTag, {
        style: 'currency',
        currency: quote.currency,
        minimumFractionDigits: 2,
      }),
    [localeTag, quote.currency],
  );

  return (
    <section className="mt-6 rounded-[var(--radius-card)] border border-[rgba(58,42,38,0.14)] bg-shell p-5">
      <h4 className="font-display text-lg">{t('title')}</h4>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-ink-soft">
            {t('accommodation', { count: quote.nightsCount })}
          </dt>
          <dd className="tabular-nums">{money.format(quote.accommodationSubtotal)}</dd>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-ink-soft">{t('cleaning')}</dt>
          <dd className={quote.cleaningFee === 0 ? 'font-semibold text-raspberry-ink' : 'tabular-nums'}>
            {quote.cleaningFee === 0 ? t('cleaningFree') : money.format(quote.cleaningFee)}
          </dd>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-ink-soft">
            {t('touristTax', { adults: quote.adults, nights: quote.nightsCount })}
          </dt>
          <dd className="tabular-nums">{money.format(quote.touristTax)}</dd>
        </div>
      </dl>

      <p className="mt-1.5 text-xs text-ink-soft">{t('touristTaxNote')}</p>

      <hr className="rule my-4" />

      <div className="flex items-baseline justify-between gap-4">
        <span className="font-display text-lg">{t('total')}</span>
        <span className="font-display text-lg tabular-nums">{money.format(quote.total)}</span>
      </div>

      <dl className="mt-4 space-y-2 rounded-[10px] bg-sand p-4 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="font-semibold">{t('depositNow', { percent: Math.round(quote.depositPercentage) })}</dt>
          <dd className="font-semibold tabular-nums">{money.format(quote.depositAmount)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-ink-soft">{t('balanceLater')}</dt>
          <dd className="tabular-nums">{money.format(quote.balanceAmount)}</dd>
        </div>
      </dl>
    </section>
  );
}
