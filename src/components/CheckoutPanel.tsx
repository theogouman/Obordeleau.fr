'use client';

import { loadStripe } from '@stripe/stripe-js';
import type {
  Stripe,
  StripeElementLocale,
  StripeElements,
  StripePaymentElement,
} from '@stripe/stripe-js';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';

/**
 * The card step.
 *
 * The card itself never touches this site: the fields live in Stripe's own
 * frame, and what comes back is a token. The amount is not passed in either,
 * only the client secret of a payment the server has already opened for a
 * figure it worked out itself, so there is nothing here a browser could change.
 *
 * The nights are already held by the time this renders. The countdown is the
 * honest version of that: it says how long they are held for, and when it runs
 * out it hands the flow back rather than letting a card be entered against a
 * hold that has gone.
 *
 * Stripe's frame is themed through the appearance API with the project tokens.
 * They are written out as literals because an iframe cannot read the parent
 * page's custom properties.
 */

const APPEARANCE = {
  theme: 'stripe' as const,
  variables: {
    colorPrimary: '#a8253c',
    colorBackground: '#ffffff',
    colorText: '#3a2a26',
    colorTextSecondary: '#6b5750',
    colorDanger: '#a8253c',
    fontFamily: 'system-ui, sans-serif',
    borderRadius: '10px',
    spacingUnit: '4px',
  },
};

type Props = {
  clientSecret: string;
  publishableKey: string;
  /** Already formatted by the panel that read it off the quote. */
  amountLabel: string;
  /** The one line of the mandate, when a card is being kept. Null otherwise. */
  mandate: string | null;
  holdExpiresAt: string | null;
  onPaid: (paymentIntentId: string) => void;
  onExpired: () => void;
  onBack: () => void;
};

function minutesLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const end = Date.parse(expiresAt);
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / 60_000));
}

export function CheckoutPanel({
  clientSecret,
  publishableKey,
  amountLabel,
  mandate,
  holdExpiresAt,
  onPaid,
  onExpired,
  onBack,
}: Props) {
  const t = useTranslations('reservation.booking.payment');
  const locale = useLocale();

  const mountPoint = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [elements, setElements] = useState<StripeElements | null>(null);
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(() => minutesLeft(holdExpiresAt));

  useEffect(() => {
    let cancelled = false;
    let element: StripePaymentElement | null = null;

    const boot = async () => {
      try {
        const loaded = await loadStripe(publishableKey);
        if (cancelled) return;

        if (!loaded || !mountPoint.current) {
          setError(t('errors.load'));
          return;
        }

        const created = loaded.elements({
          clientSecret,
          appearance: APPEARANCE,
          locale: locale as StripeElementLocale,
        });

        element = created.create('payment', { layout: 'tabs' });
        element.on('ready', () => {
          if (!cancelled) setReady(true);
        });
        element.mount(mountPoint.current);

        setStripe(loaded);
        setElements(created);
      } catch {
        if (!cancelled) setError(t('errors.load'));
      }
    };

    void boot();

    return () => {
      cancelled = true;
      element?.destroy();
    };
    // t is stable for a given locale, and re-running this would remount the frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSecret, publishableKey, locale]);

  // Held in a ref so the interval below depends on the deadline alone. The
  // parent passes an inline handler, and putting it in the dependency list
  // would tear the timer down and rebuild it on every render.
  const expiredHandler = useRef(onExpired);
  expiredHandler.current = onExpired;

  // The hold is a promise with a clock on it, so the clock is shown.
  useEffect(() => {
    if (!holdExpiresAt) return;

    const tick = () => {
      const left = minutesLeft(holdExpiresAt);
      setRemaining(left);
      if (left !== null && left <= 0) expiredHandler.current();
    };

    tick();
    const timer = window.setInterval(tick, 20_000);
    return () => window.clearInterval(timer);
  }, [holdExpiresAt]);

  const pay = useCallback(async () => {
    if (!stripe || !elements || paying) return;

    setPaying(true);
    setError(null);

    // Where a card that needs a full page redirect for 3D Secure comes back to.
    // No hash and no query of our own: Stripe appends its own parameters, and
    // the booking card picks them up on the way back in.
    const returnUrl = `${window.location.origin}${window.location.pathname}`;

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    });

    if (result.error) {
      setError(result.error.message ?? t('errors.card'));
      setPaying(false);
      return;
    }

    const intent = result.paymentIntent;

    if (intent && (intent.status === 'succeeded' || intent.status === 'processing')) {
      onPaid(intent.id);
      return;
    }

    setError(t('errors.card'));
    setPaying(false);
  }, [stripe, elements, paying, onPaid, t]);

  const expired = remaining !== null && remaining <= 0;

  return (
    <div>
      <h3 className="font-display text-xl">{t('title')}</h3>

      <p className="mt-2 text-sm text-ink-soft">{t('summary', { amount: amountLabel })}</p>

      {mandate ? (
        <p className="mt-3 rounded-[10px] bg-sand p-3 text-xs text-ink-soft">{mandate}</p>
      ) : null}

      {holdExpiresAt ? (
        <p className="mt-3 text-xs text-ink-soft" role="status" aria-live="polite">
          {expired ? t('holdExpired') : t('holdNotice', { minutes: remaining ?? 0 })}
        </p>
      ) : null}

      <div className="mt-5" ref={mountPoint} />

      {!ready && !error ? (
        <p className="mt-4 text-center text-sm text-ink-soft" role="status" aria-live="polite">
          {t('loading')}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-[10px] bg-sand p-3 text-sm text-raspberry-ink" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void pay()}
        disabled={!ready || paying || expired}
        className="btn btn-primary mt-6 w-full"
      >
        {paying ? t('paying') : t('pay', { amount: amountLabel })}
        {paying ? null : <Icon name="checkCircle" className="h-[1.05em] w-auto" />}
      </button>

      <button
        type="button"
        onClick={onBack}
        disabled={paying}
        className="mt-3 w-full text-center text-xs text-ink-soft underline underline-offset-2"
      >
        {t('back')}
      </button>
    </div>
  );
}
