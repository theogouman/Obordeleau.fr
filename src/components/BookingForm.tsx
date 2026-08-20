'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BookingCalendar } from '@/components/BookingCalendar';
import { localeTags, type Locale } from '@/i18n/routing';
import { trackBookingConfirmed } from '@/lib/analytics';
import { addDays, nightsBetween, todayInParis } from '@/lib/dates';

/**
 * FR-103: the direct booking form.
 *
 * The visitor picks a real range on a calendar that greys out what is taken,
 * gives a name and an email, and the nights are held the moment the server
 * accepts. No payment is taken here; that arrives in Phase 3 as a hold turned
 * into a confirmation, which is why this component already talks to a single
 * write endpoint rather than to the table.
 */

type Props = {
  maxGuests: number;
  privacyHref: string;
};

type Availability = {
  blocked: ReadonlySet<string>;
  firstArrival: string;
  windowEnd: string;
};

type Errors = Partial<Record<'dates' | 'guests' | 'name' | 'email' | 'consent' | 'form', string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMPTY_BLOCKED: ReadonlySet<string> = new Set<string>();

export function BookingForm({ maxGuests, privacyHref }: Props) {
  const t = useTranslations('reservation.booking');
  const common = useTranslations('common');
  const locale = useLocale() as Locale;

  const [availability, setAvailability] = useState<Availability | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [arrival, setArrival] = useState<string | null>(null);
  const [departure, setDeparture] = useState<string | null>(null);
  const [state, setState] = useState<'editing' | 'sending' | 'booked'>('editing');
  // Two steps: the dates first, then who is coming. Asking for a name before
  // knowing the nights are free is asking for nothing.
  const [step, setStep] = useState<'dates' | 'details'>('dates');
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const startedAt = useMemo(() => Date.now(), []);

  const loadAvailability = useCallback(async () => {
    setCalendarStatus('loading');

    try {
      const response = await fetch('/api/availability', { cache: 'no-store' });
      if (!response.ok) throw new Error(`availability ${response.status}`);

      const data = (await response.json()) as {
        to: string;
        firstArrival: string;
        blocked: string[];
      };

      setAvailability({
        blocked: new Set(data.blocked),
        firstArrival: data.firstArrival,
        windowEnd: data.to,
      });
      setCalendarStatus('ready');
    } catch {
      setCalendarStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  // Until the real window arrives, assume the strictest guess the browser can
  // make. Nothing is selectable while loading, so this never promises a night.
  const firstArrival = availability?.firstArrival ?? addDays(todayInParis(), 1);
  const windowEnd = availability?.windowEnd ?? addDays(firstArrival, 365);
  const blocked = availability?.blocked ?? EMPTY_BLOCKED;

  const nights = arrival && departure ? nightsBetween(arrival, departure) : 0;

  const readableRange = useMemo(() => {
    if (!arrival || !departure) return '';
    const format = new Intl.DateTimeFormat(localeTags[locale], {
      dateStyle: 'long',
      timeZone: 'UTC',
    });
    return t('range', {
      from: format.format(new Date(`${arrival}T00:00:00Z`)),
      to: format.format(new Date(`${departure}T00:00:00Z`)),
    });
  }, [arrival, departure, locale, t]);

  function onRangeChange(nextArrival: string | null, nextDeparture: string | null) {
    setArrival(nextArrival);
    setDeparture(nextDeparture);
    setErrors((current) => ({ ...current, dates: undefined, form: undefined }));
  }

  function goToDetails() {
    if (!arrival || !departure) {
      setErrors((current) => ({ ...current, dates: t('errors.datesMissing') }));
      return;
    }
    setStep('details');
  }

  // Moving on is a change of context, so the focus follows it rather than
  // staying on a button that no longer exists.
  useEffect(() => {
    if (step === 'details') detailsHeading.current?.focus();
  }, [step]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const guests = Number(data.get('guests') ?? 0);
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const consent = data.get('consent') === 'on';

    const nextErrors: Errors = {};
    if (!arrival || !departure) nextErrors.dates = t('errors.datesMissing');
    if (!name) nextErrors.name = t('errors.required');
    if (!email) nextErrors.email = t('errors.required');
    else if (!EMAIL_PATTERN.test(email)) nextErrors.email = t('errors.email');
    if (!Number.isFinite(guests) || guests < 1 || guests > maxGuests) {
      nextErrors.guests = t('errors.guests');
    }
    if (!consent) nextErrors.consent = t('errors.consent');

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      const firstField = Object.keys(nextErrors)[0];
      form.querySelector<HTMLElement>(`[name="${firstField}"]`)?.focus();
      return;
    }

    setState('sending');

    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: arrival,
          to: departure,
          guests,
          name,
          email,
          phone: String(data.get('phone') ?? '').trim(),
          message: String(data.get('message') ?? '').trim(),
          consent,
          locale,
          company: String(data.get('company') ?? ''),
          elapsedMs: Date.now() - startedAt,
        }),
      });

      if (response.status === 409) {
        // Someone else committed these nights first. Show what is left rather
        // than leaving a selection that can no longer be booked.
        setErrors({ form: t('errors.unavailable') });
        setArrival(null);
        setDeparture(null);
        setStep('dates');
        setState('editing');
        void loadAvailability();
        return;
      }

      if (response.status === 429) {
        setErrors({ form: t('errors.rateLimited') });
        setState('editing');
        return;
      }

      if (response.status === 503) {
        setErrors({ form: t('errors.notConfigured') });
        setState('editing');
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setErrors({
          form:
            body.error === 'too_soon' || body.error === 'min_nights'
              ? t('errors.datesRule')
              : t('errors.server'),
        });
        setState('editing');
        return;
      }

      const booked = (await response.json()) as { reference?: string };

      trackBookingConfirmed(locale);
      setReference(booked.reference ?? '');
      setState('booked');
      form.reset();
    } catch {
      setErrors({ form: t('errors.server') });
      setState('editing');
    }
  }

  if (state === 'booked') {
    return (
      <div className="card p-6 text-center" role="status" aria-live="polite">
        <SuccessCheck />
        <h3 className="mt-4 font-display text-2xl">{t('successTitle')}</h3>
        <p className="mt-2 text-ink-soft">{t('successBody')}</p>
        {reference ? (
          <p className="mt-3 text-sm text-ink-soft">
            {t('successReference')} <span className="font-semibold text-ink">{reference}</span>
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setState('editing');
            setStep('dates');
            setArrival(null);
            setDeparture(null);
            void loadAvailability();
          }}
          className="btn btn-secondary mt-6"
        >
          {t('successAgain')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="card p-6">
      <p className="text-sm font-medium text-ink-soft">
        {t('step', { current: step === 'dates' ? 1 : 2, total: 2 })}
      </p>

      {errors.form ? (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius-card)] bg-[rgba(206,66,87,0.1)] p-3 text-sm text-raspberry-ink"
        >
          {errors.form}
        </p>
      ) : null}

      {/* Step one. The inactive step stays in the document, hidden, so going back
          to change a date does not wipe what has already been typed. */}
      <div hidden={step !== 'dates'}>
        <h3 className="mt-1 font-display text-2xl">{t('title')}</h3>
        <p className="mt-2 text-ink-soft">{t('intro')}</p>

        <div className="mt-6">
          <BookingCalendar
            blocked={blocked}
            firstArrival={firstArrival}
            windowEnd={windowEnd}
            arrival={arrival}
            departure={departure}
            onChange={onRangeChange}
            status={calendarStatus}
            onRetry={() => void loadAvailability()}
          />
        </div>

        <p className="mt-3 text-sm text-ink-soft" role="status" aria-live="polite">
          {nights > 0 ? `${readableRange}, ${t('nights', { count: nights })}` : t('noDatesYet')}
        </p>

        {errors.dates ? <p className="mt-1 text-sm text-raspberry-ink">{errors.dates}</p> : null}

        <button
          type="button"
          onClick={goToDetails}
          disabled={nights < 1}
          className="btn btn-primary mt-6 w-full disabled:cursor-not-allowed disabled:opacity-45"
        >
          {t('continue')}
        </button>
      </div>

      {/* Step two. */}
      <div hidden={step !== 'details'}>
        <h3 ref={detailsHeading} tabIndex={-1} className="mt-1 font-display text-2xl">
          {t('detailsTitle')}
        </h3>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-sand px-4 py-3">
          <p className="text-sm">
            <span className="font-semibold">{readableRange}</span>
            {nights > 0 ? (
              <span className="text-ink-soft">, {t('nights', { count: nights })}</span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => setStep('dates')}
            className="text-sm text-raspberry-ink underline underline-offset-4"
          >
            {t('changeDates')}
          </button>
        </div>

        <p className="mt-3 text-ink-soft">{t('detailsIntro')}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field
            label={t('guests')}
            name="guests"
            type="number"
            required
            min="1"
            max={String(maxGuests)}
            defaultValue="2"
            error={errors.guests}
          />
          <Field label={t('phone')} name="phone" type="tel" autoComplete="tel" hint={common('optional')} />
          <Field label={t('name')} name="name" type="text" required autoComplete="name" error={errors.name} />
          <Field label={t('email')} name="email" type="email" required autoComplete="email" error={errors.email} />
        </div>

        <div className="mt-4">
          <label htmlFor="booking-message" className="block text-sm font-medium">
            {t('message')}
            <span className="ms-1 font-normal text-ink-soft">({common('optional')})</span>
          </label>
          <textarea
            id="booking-message"
            name="message"
            rows={3}
            placeholder={t('messagePlaceholder')}
            className="mt-1.5 w-full rounded-[var(--radius-card)] border border-[rgba(58,42,38,0.22)] bg-cream px-3 py-2"
          />
        </div>

        {/* Honeypot: hidden from people, tempting for bots. */}
        <div aria-hidden="true" className="visually-hidden">
          <label htmlFor="booking-company">{t('honeypotLabel')}</label>
          <input id="booking-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="mt-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="consent"
              className="mt-1 size-4 shrink-0 accent-[var(--color-raspberry)]"
              aria-describedby={errors.consent ? 'booking-consent-error' : undefined}
            />
            <span>
              {t('consent')}{' '}
              <a className="text-raspberry-ink underline underline-offset-4" href={privacyHref}>
                {t('consentLink')}
              </a>
            </span>
          </label>
          {errors.consent ? (
            <p id="booking-consent-error" className="mt-1 text-sm text-raspberry-ink">
              {errors.consent}
            </p>
          ) : null}
        </div>

        <button type="submit" disabled={state === 'sending'} className="btn btn-primary mt-6 w-full">
          {state === 'sending' ? (
            <>
              <Spinner />
              {t('submitting')}
            </>
          ) : (
            t('submit')
          )}
        </button>

        <p className="mt-3 text-center text-xs text-ink-soft">{t('noPayment')}</p>
      </div>
    </form>
  );
}

type FieldProps = {
  label: string;
  name: string;
  type: string;
  required?: boolean;
  error?: string;
  hint?: string;
  min?: string;
  max?: string;
  defaultValue?: string;
  autoComplete?: string;
};

function Field({
  label,
  name,
  type,
  required = false,
  error,
  hint,
  min,
  max,
  defaultValue,
  autoComplete,
}: FieldProps) {
  const id = `booking-${name}`;
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {hint ? <span className="ms-1 font-normal text-ink-soft">({hint})</span> : null}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        min={min}
        max={max}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`mt-1.5 w-full rounded-[var(--radius-card)] border bg-cream px-3 py-2 ${
          error ? 'border-raspberry-ink' : 'border-[rgba(58,42,38,0.22)]'
        }`}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-raspberry-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.9s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

function SuccessCheck() {
  return (
    <svg viewBox="0 0 52 52" width="56" height="56" aria-hidden="true" focusable="false" className="mx-auto">
      <circle cx="26" cy="26" r="24" fill="none" stroke="var(--color-raspberry)" strokeWidth="2" />
      <path
        d="M15 27l8 8 15-16"
        fill="none"
        stroke="var(--color-raspberry)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="draw-check"
      />
    </svg>
  );
}
