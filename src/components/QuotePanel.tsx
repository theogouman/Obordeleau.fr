'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId, useMemo, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { PopNumber } from '@/components/PopNumber';
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
 *
 * Two lines carry more than they can say in the room they have, the local tax
 * and the day the balance goes out. Neither explanation is worth a paragraph
 * under the panel, so both are hung on tooltip (17) behind a mark, reachable
 * by pointer and by keyboard alike.
 *
 * The foot of the panel has two shapes because the stay has two ways of being
 * paid for. A deposit is only worth taking on a distant, dear stay; everything
 * else is settled today. When it is settled today there is no balance line and
 * no date, because there is no second payment to announce, and inventing a
 * greyed out one would be the panel saying something that is not true.
 */

type Props = {
  quote: Quote;
  /**
   * True when the panel is taking the place of the waiting messages. Its
   * blocks then rise into place on mask reveal up, one behind the next, rather
   * than appearing where nothing was.
   */
  reveal?: boolean;
};

export function QuotePanel({ quote, reveal = false }: Props) {
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

  /**
   * The rate the nights were let at, when there is a single one to name.
   *
   * A stay can cross a season boundary or a night the owner priced by hand, and
   * then the nights are not all the same price. Naming one of them would be
   * wrong and averaging them would be arithmetic, which is the one thing this
   * panel does not do: the line falls back to the plain count instead.
   */
  const nightly = useMemo(() => {
    const prices = quote.nights.map((night) => night.resolvedPrice);
    if (prices.length === 0 || prices.some((price) => price === null)) return null;
    return prices.every((price) => price === prices[0]) ? prices[0] : null;
  }, [quote.nights]);

  const chargeDate = useMemo(() => {
    if (!quote.balanceChargeOn) return null;
    return new Intl.DateTimeFormat(localeTag, {
      dateStyle: 'long',
      timeZone: 'Europe/Paris',
    }).format(new Date(`${quote.balanceChargeOn}T12:00:00Z`));
  }, [localeTag, quote.balanceChargeOn]);

  /** Nothing follows this payment: no balance, no date, no card kept. */
  const paidInFull = quote.paymentMode === 'full';

  /** The blocks rise one behind the next, or simply are, when nothing moves. */
  const rising = reveal ? 'q-reveal' : '';
  const line = (index: 1 | 2) => (reveal ? String(index) : undefined);

  return (
    <section className="rounded-[var(--radius-card)] border border-[rgba(58,42,38,0.14)] bg-shell p-5">
      <div className={rising}>
        <h4 className="font-display text-lg">{t('title')}</h4>

        <dl className="mt-4 space-y-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-soft">
              {nightly === null
                ? t('accommodation', { count: quote.nightsCount })
                : t('accommodationAt', {
                    count: quote.nightsCount,
                    price: money.format(nightly),
                  })}
            </dt>
            <dd className="tabular-nums">{money.format(quote.accommodationSubtotal)}</dd>
          </div>

          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-soft">{t('cleaning')}</dt>
            <dd
              className={
                quote.cleaningFee === 0
                  ? 'inline-flex items-center gap-1.5 font-semibold text-raspberry-ink'
                  : 'tabular-nums'
              }
            >
              {quote.cleaningFee === 0 ? (
                <>
                  {t('cleaningFree')}
                  <Icon name="gift" className="h-[1.1em] w-auto text-raspberry" />
                </>
              ) : (
                money.format(quote.cleaningFee)
              )}
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-4">
            <dt className="inline-flex items-center gap-1.5 text-ink-soft">
              {t('touristTax')}
              <Hint text={t('touristTaxNote')} label={t('more')} />
            </dt>
            <dd className="tabular-nums">{money.format(quote.touristTax)}</dd>
          </div>
        </dl>
      </div>

      <div className={rising} data-line={line(1)}>
        <hr className="rule my-4" />

        {/* The total is the one figure the eye goes to, so it is set in the
            text face rather than the display one: the serif is beautiful and
            hard to read a price in. */}
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-display text-lg">{t('total')}</span>
          <span className="text-lg font-semibold tabular-nums">
            <PopNumber value={money.format(quote.total)} />
          </span>
        </div>
      </div>

      <div className={`mt-4 rounded-[10px] bg-sand p-4 text-sm ${rising}`} data-line={line(2)}>
        {paidInFull ? (
          <>
            <dl>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-semibold">{t('dueToday')}</dt>
                <dd className="font-semibold tabular-nums">
                  {money.format(quote.depositAmount)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-ink-soft">{t('nothingAfter')}</p>
          </>
        ) : (
          <dl className="space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-semibold">
                {t('depositNow', { percent: Math.round(quote.depositPercentage) })}
              </dt>
              <dd className="font-semibold tabular-nums">{money.format(quote.depositAmount)}</dd>
            </div>

            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">
                {chargeDate && quote.balanceChargeDaysBeforeArrival !== null
                  ? t.rich('balanceOn', {
                      date: chargeDate,
                      when: (chunks) => (
                        <Hinted
                          text={t('balanceOnNote', {
                            count: quote.balanceChargeDaysBeforeArrival ?? 0,
                          })}
                        >
                          {chunks}
                        </Hinted>
                      ),
                    })
                  : t('balanceLater')}
              </dt>
              <dd className="tabular-nums">{money.format(quote.balanceAmount)}</dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function InfoMark() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="4.8" r="0.85" fill="currentColor" />
      <path
        d="M8 7.2v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A mark that explains a line. The explanation is in the accessibility tree as
 * the description of the mark, not only in a layer that appears on hover, so a
 * visitor who never sees a tooltip is told the same thing.
 */
function Hint({ text, label }: { text: string; label: string }) {
  const id = useId();

  return (
    <span className="t-tt-wrap align-middle leading-none">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="t-tt-trigger inline-flex items-center text-ink-soft transition-colors hover:text-ink"
      >
        <InfoMark />
      </button>
      <span id={id} role="tooltip" className="t-tt t-tt--wide text-xs">
        {text}
      </span>
    </span>
  );
}

/** The same, on a few words of the sentence itself rather than on a mark. */
function Hinted({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();

  return (
    <span className="t-tt-wrap">
      <button
        type="button"
        aria-describedby={id}
        className="t-tt-trigger underline decoration-dotted underline-offset-4 transition-colors hover:text-ink"
      >
        {children}
      </button>
      <span id={id} role="tooltip" className="t-tt t-tt--wide text-xs">
        {text}
      </span>
    </span>
  );
}
