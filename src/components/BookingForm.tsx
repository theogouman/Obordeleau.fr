'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { BookingCalendar } from '@/components/BookingCalendar';
import { localeTags, type Locale } from '@/i18n/routing';
import { trackBookingConfirmed } from '@/lib/analytics';
import { addDays, nightsBetween, todayInParis } from '@/lib/dates';
import { defaultCountry, dialFor, dialOptions, fullPhoneNumber, phoneDigits } from '@/lib/phone';

/**
 * FR-103: the direct booking flow, one question at a time.
 *
 * The card opens on the calendar and nothing else. Once a stay is picked the
 * questions arrive one by one, each sliding in from the right while the one
 * just answered leaves to the left: that is transitions.dev page side by side
 * (08), generalised to six steps in `src/styles/transitions.css`. The card
 * follows the height of whichever step is showing, tweened by card resize (01),
 * a wrong answer shakes its field with error state shake (12), and a night
 * already taken explains itself through tooltip (17) in the calendar.
 *
 * Every step stays mounted, so going back to change an answer never loses one.
 */

type Props = {
  maxGuests: number;
  privacyHref: string;
  whatsappNumber: string;
};

type Availability = {
  blocked: ReadonlySet<string>;
  firstArrival: string;
  windowEnd: string;
  country: string | null;
};

type StepId = 'dates' | 'name' | 'email' | 'phone' | 'guests' | 'recap';

const STEPS: readonly StepId[] = ['dates', 'name', 'email', 'phone', 'guests', 'recap'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PHONE_DIGITS = 6;
const SHAKE_MS = 280;
const EMPTY_BLOCKED: ReadonlySet<string> = new Set<string>();

export function BookingForm({ maxGuests, privacyHref, whatsappNumber }: Props) {
  const t = useTranslations('reservation.booking');
  const locale = useLocale() as Locale;
  const localeTag = localeTags[locale];

  const [availability, setAvailability] = useState<Availability | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const [stepIndex, setStepIndex] = useState(0);
  const [arrival, setArrival] = useState<string | null>(null);
  const [departure, setDeparture] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState(() => defaultCountry(null, locale));
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState<number | null>(null);

  const [state, setState] = useState<'editing' | 'sending' | 'booked'>('editing');
  const [booked, setBooked] = useState<{ reference: string; from: string; to: string } | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const honeypot = useRef<HTMLInputElement>(null);
  const startedAt = useMemo(() => Date.now(), []);
  const step = STEPS[stepIndex];

  /* --- availability ------------------------------------------------------ */

  const loadAvailability = useCallback(async () => {
    setCalendarStatus('loading');

    try {
      const response = await fetch('/api/availability', { cache: 'no-store' });
      if (!response.ok) throw new Error(`availability ${response.status}`);

      const data = (await response.json()) as {
        to: string;
        firstArrival: string;
        blocked: string[];
        country: string | null;
      };

      setAvailability({
        blocked: new Set(data.blocked),
        firstArrival: data.firstArrival,
        windowEnd: data.to,
        country: data.country,
      });
      setCalendarStatus('ready');
    } catch {
      setCalendarStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  // The phone field opens on the calling code of wherever the visitor is, and
  // on the language they are reading when the edge did not say.
  const detectedCountry = availability?.country ?? null;
  const touchedCountry = useRef(false);

  useEffect(() => {
    if (touchedCountry.current) return;
    setCountry(defaultCountry(detectedCountry, locale));
  }, [detectedCountry, locale]);

  const firstArrival = availability?.firstArrival ?? addDays(todayInParis(), 1);
  const windowEnd = availability?.windowEnd ?? addDays(firstArrival, 365);
  const blocked = availability?.blocked ?? EMPTY_BLOCKED;

  const nights = arrival && departure ? nightsBetween(arrival, departure) : 0;

  const longDate = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { dateStyle: 'long', timeZone: 'UTC' }),
    [localeTag],
  );

  const readableRange = useMemo(() => {
    if (!arrival || !departure) return '';
    return t('range', {
      from: longDate.format(new Date(`${arrival}T00:00:00Z`)),
      to: longDate.format(new Date(`${departure}T00:00:00Z`)),
    });
  }, [arrival, departure, longDate, t]);

  const dials = useMemo(() => dialOptions(localeTag), [localeTag]);

  /* --- the card follows the step that is showing ------------------------- */

  const panelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [frameHeight, setFrameHeight] = useState<number>();
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    const panel = panelRefs.current[stepIndex];
    if (!panel) return;

    const measure = () => setFrameHeight(panel.offsetHeight);
    measure();
    setMeasured(true);

    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [stepIndex, state]);

  /* --- navigation -------------------------------------------------------- */

  const navigated = useRef(false);

  useEffect(() => {
    if (!navigated.current) return;
    panelRefs.current[stepIndex]?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [stepIndex]);

  function goTo(index: number) {
    navigated.current = true;
    setStepError(null);
    setStepIndex(index);
  }

  function refuse(message: string) {
    setStepError(message);
    setShaking(true);
    window.setTimeout(() => setShaking(false), SHAKE_MS);
  }

  function validateStep(): boolean {
    switch (step) {
      case 'dates':
        if (nights < 1) {
          refuse(t('errors.datesMissing'));
          return false;
        }
        return true;
      case 'name':
        if (name.trim().length < 2) {
          refuse(t('errors.required'));
          return false;
        }
        return true;
      case 'email':
        if (!EMAIL_PATTERN.test(email.trim())) {
          refuse(t(email.trim() === '' ? 'errors.required' : 'errors.email'));
          return false;
        }
        return true;
      case 'phone':
        if (phoneDigits(phone).length < MIN_PHONE_DIGITS) {
          refuse(t(phone.trim() === '' ? 'errors.required' : 'errors.phone'));
          return false;
        }
        return true;
      case 'guests':
        if (guests === null) {
          refuse(t('errors.guests'));
          return false;
        }
        return true;
      default:
        return true;
    }
  }

  function next() {
    if (!validateStep()) return;
    goTo(Math.min(stepIndex + 1, STEPS.length - 1));
  }

  function chooseGuests(count: number) {
    setGuests(count);
    setStepError(null);
  }

  function onRangeChange(nextArrival: string | null, nextDeparture: string | null) {
    setArrival(nextArrival);
    setDeparture(nextDeparture);
    setStepError(null);
    setFormError(null);
  }

  /* --- submission -------------------------------------------------------- */

  async function submit() {
    if (!arrival || !departure || guests === null) return;

    setState('sending');
    setFormError(null);

    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: arrival,
          to: departure,
          guests,
          name: name.trim(),
          email: email.trim(),
          phone: fullPhoneNumber(country, phone),
          // Pressing the button is the consent, so there is no box to tick.
          consent: true,
          locale,
          company: honeypot.current?.value ?? '',
          elapsedMs: Date.now() - startedAt,
        }),
      });

      if (response.status === 409) {
        setFormError(t('errors.unavailable'));
        setArrival(null);
        setDeparture(null);
        setState('editing');
        goTo(0);
        void loadAvailability();
        return;
      }

      if (response.status === 429) {
        setFormError(t('errors.rateLimited'));
        setState('editing');
        return;
      }

      if (response.status === 503) {
        setFormError(t('errors.notConfigured'));
        setState('editing');
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setFormError(
          body.error === 'too_soon' || body.error === 'min_nights'
            ? t('errors.datesRule')
            : t('errors.server'),
        );
        setState('editing');
        return;
      }

      const confirmed = (await response.json()) as { reference?: string };

      trackBookingConfirmed(locale);
      setBooked({ reference: confirmed.reference ?? '', from: arrival, to: departure });
      setState('booked');
    } catch {
      setFormError(t('errors.server'));
      setState('editing');
    }
  }


  /* --- confirmation ------------------------------------------------------ */

  if (state === 'booked' && booked) {
    const asDayMonthYear = (isoDate: string) =>
      `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}.${isoDate.slice(0, 4)}`;

    const whatsappHref = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
      t('whatsappMessage', {
        from: asDayMonthYear(booked.from),
        to: asDayMonthYear(booked.to),
      }),
    )}`;

    return (
      <div className="card p-8 text-center" role="status" aria-live="polite">
        <SuccessCheck />
        <h3 className="mt-4 font-display text-2xl">{t('successTitle')}</h3>
        <p className="mt-2 text-ink-soft">{t('successBody')}</p>
        {booked.reference ? (
          <p className="mt-3 text-sm text-ink-soft">
            {t('successReference')}{' '}
            <span className="font-semibold text-ink">{booked.reference}</span>
          </p>
        ) : null}

        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary mt-6 inline-flex"
        >
          <WhatsAppMark />
          {t('whatsappCta')}
        </a>
      </div>
    );
  }

  /* --- the wizard --------------------------------------------------------- */

  const recapIndex = STEPS.indexOf('recap');

  return (
    <div className="card p-6 sm:p-8">
      {formError ? (
        <p
          role="alert"
          className="mb-5 rounded-[var(--radius-card)] bg-[rgba(206,66,87,0.1)] p-3 text-sm text-raspberry-ink"
        >
          {formError}
        </p>
      ) : null}

      {/* Honeypot: hidden from people, tempting for bots. */}
      <div aria-hidden="true" className="visually-hidden">
        <label htmlFor="booking-company">{t('honeypotLabel')}</label>
        <input
          ref={honeypot}
          id="booking-company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div
        className="t-step-slide t-resize"
        style={measured && frameHeight ? { height: `${frameHeight}px` } : undefined}
      >
        {STEPS.map((id, index) => {
          const position = index < stepIndex ? 'before' : index > stepIndex ? 'after' : 'active';
          const active = position === 'active';

          return (
            <div
              key={id}
              ref={(node) => {
                panelRefs.current[index] = node;
              }}
              data-position={position}
              inert={active ? undefined : true}
              // Before the first measurement there is no height to hold the
              // absolutely placed steps up, so the active one stays in flow.
              className={`t-step ${measured ? '' : active ? 'static' : 'hidden'}`}
            >
              {id === 'dates' ? (
                <Step
                  onNext={next}
                  nextLabel={t('continue')}
                  nextDisabled={nights < 1}
                  error={stepError}
                  shaking={shaking}
                >
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
                  <p className="mt-3 text-center text-sm text-ink-soft" role="status" aria-live="polite">
                    {nights > 0
                      ? `${readableRange}, ${t('nights', { count: nights })}`
                      : t('noDatesYet')}
                  </p>
                </Step>
              ) : null}

              {id === 'name' ? (
                <Step
                  onNext={next}
                  onBack={() => goTo(index - 1)}
                  backLabel={t('back')}
                  nextLabel={t('continue')}
                  error={stepError}
                  shaking={shaking}
                >
                  <Question htmlFor="booking-name" label={t('questions.name')}>
                    <input
                      id="booking-name"
                      data-autofocus
                      type="text"
                      autoComplete="name"
                      placeholder={t('placeholders.name')}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      onKeyDown={submitOnEnter(next)}
                      aria-invalid={stepError ? 'true' : undefined}
                      className={fieldClass(shaking, Boolean(stepError))}
                    />
                  </Question>
                </Step>
              ) : null}

              {id === 'email' ? (
                <Step
                  onNext={next}
                  onBack={() => goTo(index - 1)}
                  backLabel={t('back')}
                  nextLabel={t('continue')}
                  error={stepError}
                  shaking={shaking}
                >
                  <Question htmlFor="booking-email" label={t('questions.email')}>
                    <input
                      id="booking-email"
                      data-autofocus
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder={t('placeholders.email')}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      onKeyDown={submitOnEnter(next)}
                      aria-invalid={stepError ? 'true' : undefined}
                      className={fieldClass(shaking, Boolean(stepError))}
                    />
                  </Question>
                </Step>
              ) : null}

              {id === 'phone' ? (
                <Step
                  onNext={next}
                  onBack={() => goTo(index - 1)}
                  backLabel={t('back')}
                  nextLabel={t('continue')}
                  error={stepError}
                  shaking={shaking}
                >
                  <Question htmlFor="booking-phone" label={t('questions.phone')}>
                    <div className="flex gap-2">
                      <label htmlFor="booking-dial" className="visually-hidden">
                        {t('questions.dial')}
                      </label>
                      <select
                        id="booking-dial"
                        value={country}
                        onChange={(event) => {
                          touchedCountry.current = true;
                          setCountry(event.target.value);
                        }}
                        className="shrink-0 rounded-[var(--radius-card)] border border-[rgba(58,42,38,0.22)] bg-cream px-2 py-3 text-base"
                      >
                        <optgroup label={t('questions.dialCommon')}>
                          {dials.priority.map((option) => (
                            <option key={option.country} value={option.country}>
                              {option.flag} {option.name} +{option.dial}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={t('questions.dialAll')}>
                          {dials.rest.map((option) => (
                            <option key={option.country} value={option.country}>
                              {option.flag} {option.name} +{option.dial}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      <div className="relative flex-1">
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-ink-soft"
                        >
                          +{dialFor(country)}
                        </span>
                        <input
                          id="booking-phone"
                          data-autofocus
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel-national"
                          placeholder={t('placeholders.phone')}
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          onKeyDown={submitOnEnter(next)}
                          aria-invalid={stepError ? 'true' : undefined}
                          className={`${fieldClass(shaking, Boolean(stepError))} ps-14`}
                        />
                      </div>
                    </div>
                  </Question>
                </Step>
              ) : null}

              {id === 'guests' ? (
                <Step
                  onNext={next}
                  nextLabel={t('continue')}
                  onBack={() => goTo(index - 1)}
                  backLabel={t('back')}
                  error={stepError}
                  shaking={shaking}
                >
                  <fieldset>
                    <legend className="font-display text-xl">{t('questions.guests')}</legend>
                    <div className="mt-4 grid grid-cols-4 gap-3">
                      {Array.from({ length: maxGuests }, (_, seat) => seat + 1).map((count) => (
                        <label
                          key={count}
                          data-guests={count}
                          className={`flex cursor-pointer items-center justify-center rounded-[var(--radius-card)] border py-4 text-lg font-semibold transition-colors ${
                            guests === count
                              ? 'border-raspberry bg-raspberry text-white'
                              : 'border-[rgba(58,42,38,0.22)] bg-cream hover:border-ink'
                          }`}
                        >
                          <input
                            type="radio"
                            name="guests"
                            value={count}
                            checked={guests === count}
                            onChange={() => chooseGuests(count)}
                            className="visually-hidden peer"
                            {...(count === 1 ? { 'data-autofocus': true } : {})}
                          />
                          <span className="peer-focus-visible:underline peer-focus-visible:underline-offset-4">
                            {count}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </Step>
              ) : null}

              {id === 'recap' ? (
                <div>
                  <h3 className="font-display text-xl">{t('recapTitle')}</h3>

                  <dl className="mt-4 divide-y divide-[rgba(58,42,38,0.12)]">
                    <RecapRow
                      label={t('questions.dates')}
                      value={`${readableRange}, ${t('nights', { count: nights })}`}
                      onEdit={() => goTo(STEPS.indexOf('dates'))}
                      editLabel={t('edit')}
                    />
                    <RecapRow
                      label={t('questions.name')}
                      value={name.trim()}
                      onEdit={() => goTo(STEPS.indexOf('name'))}
                      editLabel={t('edit')}
                    />
                    <RecapRow
                      label={t('questions.email')}
                      value={email.trim()}
                      onEdit={() => goTo(STEPS.indexOf('email'))}
                      editLabel={t('edit')}
                    />
                    <RecapRow
                      label={t('questions.phone')}
                      value={fullPhoneNumber(country, phone)}
                      onEdit={() => goTo(STEPS.indexOf('phone'))}
                      editLabel={t('edit')}
                    />
                    <RecapRow
                      label={t('questions.guests')}
                      value={String(guests ?? '')}
                      onEdit={() => goTo(STEPS.indexOf('guests'))}
                      editLabel={t('edit')}
                    />
                  </dl>

                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={state === 'sending'}
                    className="btn btn-primary mt-6 w-full"
                  >
                    {state === 'sending' ? (
                      <>
                        <Spinner />
                        {t('submitting')}
                      </>
                    ) : (
                      t('submit')
                    )}
                  </button>

                  <p className="mt-3 text-center text-xs text-ink-soft">
                    {t.rich('consentNotice', {
                      link: (chunks) => (
                        <a
                          className="text-raspberry-ink underline underline-offset-4"
                          href={privacyHref}
                        >
                          {chunks}
                        </a>
                      ),
                    })}
                  </p>

                  <button
                    type="button"
                    onClick={() => goTo(recapIndex - 1)}
                    className="mt-4 block w-full text-center text-sm text-ink-soft underline underline-offset-4"
                  >
                    {t('back')}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function submitOnEnter(action: () => void) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    action();
  };
}

function fieldClass(shaking: boolean, invalid: boolean): string {
  return [
    't-input mt-4 w-full rounded-[var(--radius-card)] border bg-cream px-3 py-3 text-base',
    invalid ? 'is-error border-raspberry-ink' : 'border-[rgba(58,42,38,0.22)]',
    shaking && invalid ? 'is-shaking' : '',
  ].join(' ');
}

type StepProps = {
  children: ReactNode;
  error: string | null;
  shaking: boolean;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  onBack?: () => void;
  backLabel?: string;
};

function Step({ children, error, onNext, nextLabel, nextDisabled, onBack, backLabel }: StepProps) {
  return (
    <div className={`t-input-wrap ${error ? 'is-error' : ''}`}>
      {children}

      <p className="t-error-msg mt-2 text-sm text-raspberry-ink" role="alert">
        {error ?? ''}
      </p>

      {onNext && nextLabel ? (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="btn btn-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-45"
        >
          {nextLabel}
        </button>
      ) : null}

      {onBack && backLabel ? (
        <button
          type="button"
          onClick={onBack}
          className="mt-4 block w-full text-center text-sm text-ink-soft underline underline-offset-4"
        >
          {backLabel}
        </button>
      ) : null}
    </div>
  );
}

function Question({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block font-display text-xl">
        {label}
      </label>
      {children}
    </div>
  );
}

function RecapRow({
  label,
  value,
  onEdit,
  editLabel,
}: {
  label: string;
  value: string;
  onEdit: () => void;
  editLabel: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-[0.14em] text-ink-soft">{label}</dt>
        <dd className="truncate font-medium">{value}</dd>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 text-sm text-raspberry-ink underline underline-offset-4"
      >
        {editLabel}
      </button>
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

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-8.7 15L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.2 14.8l-.3-.2-2.6.7.7-2.5-.2-.3A8 8 0 0 1 12 4zm-3.3 4c-.2 0-.5.1-.7.4-.2.3-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.6 4 3.5 1.9.8 2.3.6 2.7.6.4 0 1.3-.5 1.5-1.1.2-.6.2-1 .1-1.1l-.6-.3-1.4-.7c-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1-.2-.1-.9-.4-1.8-1.1-.7-.6-1.1-1.3-1.2-1.5-.1-.2 0-.4.1-.5l.4-.5.2-.4v-.4L9.4 8.4c-.2-.4-.4-.4-.5-.4z"
      />
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
