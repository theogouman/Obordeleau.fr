'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { trackInquirySubmitted } from '@/lib/analytics';

export type InquiryLabels = {
  title: string;
  intro: string;
  arrival: string;
  departure: string;
  guests: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  messagePlaceholder: string;
  consent: string;
  consentLink: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: string;
  successAgain: string;
  optional: string;
  honeypotLabel: string;
  errors: {
    required: string;
    email: string;
    dateOrder: string;
    datePast: string;
    guests: string;
    consent: string;
    rateLimited: string;
    server: string;
  };
};

type Props = {
  labels: InquiryLabels;
  maxGuests: number;
  locale: string;
  privacyHref: string;
};

type Errors = Partial<Record<'arrival' | 'departure' | 'guests' | 'name' | 'email' | 'consent' | 'form', string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function InquiryForm({ labels, maxGuests, locale, privacyHref }: Props) {
  const [state, setState] = useState<'editing' | 'sending' | 'sent'>('editing');
  const [errors, setErrors] = useState<Errors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const startedAt = useMemo(() => Date.now(), []);
  const today = useMemo(todayIso, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const arrival = String(data.get('arrival') ?? '');
    const departure = String(data.get('departure') ?? '');
    const guests = Number(data.get('guests') ?? 0);
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const consent = data.get('consent') === 'on';

    const nextErrors: Errors = {};
    if (!name) nextErrors.name = labels.errors.required;
    if (!email) nextErrors.email = labels.errors.required;
    else if (!EMAIL_PATTERN.test(email)) nextErrors.email = labels.errors.email;
    if (!arrival) nextErrors.arrival = labels.errors.required;
    else if (arrival < today) nextErrors.arrival = labels.errors.datePast;
    if (!departure) nextErrors.departure = labels.errors.required;
    else if (arrival && departure <= arrival) nextErrors.departure = labels.errors.dateOrder;
    if (!Number.isFinite(guests) || guests < 1 || guests > maxGuests) {
      nextErrors.guests = labels.errors.guests;
    }
    if (!consent) nextErrors.consent = labels.errors.consent;

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      const firstField = Object.keys(nextErrors)[0];
      form.querySelector<HTMLElement>(`[name="${firstField}"]`)?.focus();
      return;
    }

    setState('sending');

    try {
      const response = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          arrival,
          departure,
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

      if (response.status === 429) {
        setErrors({ form: labels.errors.rateLimited });
        setState('editing');
        return;
      }

      if (!response.ok) {
        setErrors({ form: labels.errors.server });
        setState('editing');
        return;
      }

      trackInquirySubmitted(locale);
      setState('sent');
      form.reset();
    } catch {
      setErrors({ form: labels.errors.server });
      setState('editing');
    }
  }

  if (state === 'sent') {
    return (
      <div className="card p-6 text-center" role="status" aria-live="polite">
        <SuccessCheck />
        <h3 className="mt-4 font-display text-2xl">{labels.successTitle}</h3>
        <p className="mt-2 text-ink-soft">{labels.successBody}</p>
        <button
          type="button"
          onClick={() => setState('editing')}
          className="btn btn-secondary mt-6"
        >
          {labels.successAgain}
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="card p-6">
      <h3 className="font-display text-2xl">{labels.title}</h3>
      <p className="mt-2 text-ink-soft">{labels.intro}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          label={labels.arrival}
          name="arrival"
          type="date"
          required
          min={today}
          error={errors.arrival}
        />
        <Field
          label={labels.departure}
          name="departure"
          type="date"
          required
          min={today}
          error={errors.departure}
        />
        <Field
          label={labels.guests}
          name="guests"
          type="number"
          required
          min="1"
          max={String(maxGuests)}
          defaultValue="2"
          error={errors.guests}
        />
        <Field
          label={labels.phone}
          name="phone"
          type="tel"
          autoComplete="tel"
          hint={labels.optional}
        />
        <Field
          label={labels.name}
          name="name"
          type="text"
          required
          autoComplete="name"
          error={errors.name}
        />
        <Field
          label={labels.email}
          name="email"
          type="email"
          required
          autoComplete="email"
          error={errors.email}
        />
      </div>

      <div className="mt-4">
        <label htmlFor="inquiry-message" className="block text-sm font-medium">
          {labels.message}
        </label>
        <textarea
          id="inquiry-message"
          name="message"
          rows={4}
          placeholder={labels.messagePlaceholder}
          className="mt-1.5 w-full rounded-[var(--radius-card)] border border-[rgba(58,42,38,0.22)] bg-cream px-3 py-2"
        />
      </div>

      {/* Honeypot: hidden from people, tempting for bots. */}
      <div aria-hidden="true" className="visually-hidden">
        <label htmlFor="inquiry-company">{labels.honeypotLabel}</label>
        <input id="inquiry-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mt-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="consent"
            className="mt-1 size-4 shrink-0 accent-[var(--color-raspberry)]"
            aria-describedby={errors.consent ? 'consent-error' : undefined}
          />
          <span>
            {labels.consent}{' '}
            <a className="text-raspberry-ink underline underline-offset-4" href={privacyHref}>
              {labels.consentLink}
            </a>
          </span>
        </label>
        {errors.consent ? (
          <p id="consent-error" className="mt-1 text-sm text-raspberry-ink">
            {errors.consent}
          </p>
        ) : null}
      </div>

      {errors.form ? (
        <p role="alert" className="mt-4 rounded-[var(--radius-card)] bg-[rgba(206,66,87,0.1)] p-3 text-sm text-raspberry-ink">
          {errors.form}
        </p>
      ) : null}

      <button type="submit" disabled={state === 'sending'} className="btn btn-primary mt-6 w-full">
        {state === 'sending' ? (
          <>
            <Spinner />
            {labels.submitting}
          </>
        ) : (
          labels.submit
        )}
      </button>
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
  const id = `inquiry-${name}`;
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
    <svg
      viewBox="0 0 52 52"
      width="56"
      height="56"
      aria-hidden="true"
      focusable="false"
      className="mx-auto"
    >
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
