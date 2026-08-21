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
import { Icon, type IconName } from '@/components/Icon';
import { PhoneField } from '@/components/PhoneField';
import { localeTags, type Locale } from '@/i18n/routing';
import { trackBookingConfirmed } from '@/lib/analytics';
import { addDays, nightsBetween, todayInParis } from '@/lib/dates';
import { defaultCountry, formatNational, fullPhoneNumber, phoneDigits } from '@/lib/phone';

/**
 * FR-103: the direct booking flow, one question at a time.
 *
 * The card opens on the calendar and nothing else. Once a stay is picked the
 * questions arrive one at a time: the answered one lifts away and fades, and
 * only once it is gone does the next rise into its place. One step is mounted
 * at a time and the answers live in state, so going back never loses one.
 *
 * The card follows the height of whichever step is showing, tweened by
 * transitions.dev card resize (01), a wrong answer shakes its field with error
 * state shake (12), a night already taken explains itself through tooltip (17)
 * in the calendar, and the country menu opens with menu dropdown (05).
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
const STEP_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const STEP_SHIFT = 34;
const STEP_OUT_MS = 240;
const STEP_IN_MS = 300;
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

  /* --- one step at a time, lifted away then risen into place -------------- */

  const stageRef = useRef<HTMLDivElement>(null);
  const direction = useRef<1 | -1>(1);
  const animating = useRef(false);
  const navigated = useRef(false);
  const [frameHeight, setFrameHeight] = useState<number>();

  function reducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  // The card tweens to the height of the step now showing, so nothing snaps
  // underneath while the question rises into place.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const measure = () => setFrameHeight(stage.offsetHeight);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stepIndex, state]);

  // Entry of the new question, then the focus, once the old one has gone.
  useEffect(() => {
    if (!navigated.current) return;
    const stage = stageRef.current;

    if (stage && !reducedMotion()) {
      stage.getAnimations().forEach((animation) => animation.cancel());
      stage.animate(
        [
          { transform: `translateY(${STEP_SHIFT * direction.current}px)`, opacity: 0 },
          { transform: 'translateY(0)', opacity: 1 },
        ],
        { duration: STEP_IN_MS, easing: STEP_EASE, fill: 'both' },
      );
    }

    const timer = window.setTimeout(
      () => stageRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(),
      60,
    );
    return () => window.clearTimeout(timer);
  }, [stepIndex]);

  /* --- navigation -------------------------------------------------------- */

  function goTo(index: number, towards: 1 | -1 = 1) {
    navigated.current = true;
    direction.current = towards;
    setStepError(null);

    const stage = stageRef.current;
    if (!stage || reducedMotion()) {
      setStepIndex(index);
      return;
    }

    if (animating.current) return;
    animating.current = true;

    stage.getAnimations().forEach((animation) => animation.cancel());
    const exit = stage.animate(
      [
        { transform: 'translateY(0)', opacity: 1 },
        { transform: `translateY(${-STEP_SHIFT * towards}px)`, opacity: 0 },
      ],
      { duration: STEP_OUT_MS, easing: STEP_EASE, fill: 'forwards' },
    );

    exit.onfinish = () => {
      animating.current = false;
      setStepIndex(index);
    };
  }

  function goBack(index: number) {
    goTo(index, -1);
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

  function stepContent() {
    switch (step) {
      case 'dates':
        return (
          <Step onNext={next} nextLabel={t('continue')} nextDisabled={nights < 1} error={stepError}>
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
              {nights > 0 ? `${readableRange}, ${t('nights', { count: nights })}` : t('noDatesYet')}
            </p>
          </Step>
        );

      case 'name':
        return (
          <Step
            onNext={next}
            nextLabel={t('continue')}
            onBack={() => goBack(stepIndex - 1)}
            backLabel={t('back')}
            error={stepError}
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
        );

      case 'email':
        return (
          <Step
            onNext={next}
            nextLabel={t('continue')}
            onBack={() => goBack(stepIndex - 1)}
            backLabel={t('back')}
            error={stepError}
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
        );

      case 'phone':
        return (
          <Step
            onNext={next}
            nextLabel={t('continue')}
            onBack={() => goBack(stepIndex - 1)}
            backLabel={t('back')}
            error={stepError}
          >
            <Question htmlFor="booking-phone" label={t('questions.phone')}>
              <div className={`mt-4 ${shaking && stepError ? 't-input is-shaking' : ''}`}>
                <PhoneField
                  id="booking-phone"
                  country={country}
                  onCountryChange={(next) => {
                    touchedCountry.current = true;
                    setCountry(next);
                    setPhone((current) => formatNational(next, current));
                  }}
                  value={phone}
                  onValueChange={(value) => setPhone(formatNational(country, value))}
                  onEnter={next}
                  invalid={Boolean(stepError)}
                  placeholder={t('placeholders.phone')}
                  localeTag={localeTag}
                  autoFocus
                  labels={{
                    choose: t('questions.dial'),
                    search: t('questions.dialSearch'),
                    common: t('questions.dialCommon'),
                    all: t('questions.dialAll'),
                    empty: t('questions.dialEmpty'),
                  }}
                />
              </div>
            </Question>
          </Step>
        );

      case 'guests':
        return (
          <Step
            onNext={next}
            nextLabel={t('continue')}
            onBack={() => goBack(stepIndex - 1)}
            backLabel={t('back')}
            error={stepError}
          >
            <fieldset>
              <legend className="font-display text-xl">{t('questions.guests')}</legend>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {Array.from({ length: maxGuests }, (_, seat) => seat + 1).map((count) => (
                  <label
                    key={count}
                    data-guests={count}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-card)] border py-3 transition-colors ${
                      guests === count
                        ? 'border-raspberry bg-[rgba(206,66,87,0.07)] text-raspberry-ink'
                        : 'border-[rgba(58,42,38,0.18)] text-ink-soft hover:border-ink'
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
                    {/* One silhouette per traveller, so the count is legible
                        before the digit is read. */}
                    <span className="flex h-4 items-end justify-center gap-px" aria-hidden="true">
                      {Array.from({ length: count }, (_, seat) => (
                        <Icon key={seat} name="person" className="h-3.5 w-auto" />
                      ))}
                    </span>
                    <span className="mt-1.5 text-sm font-semibold peer-focus-visible:underline peer-focus-visible:underline-offset-4">
                      {count}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </Step>
        );

      case 'recap':
      default:
        return (
          <div>
            <h3 className="font-display text-xl">{t('recapTitle')}</h3>

            <dl className="mt-4 divide-y divide-[rgba(58,42,38,0.12)]">
              <RecapRow
                icon="calendar"
                label={t('questions.dates')}
                value={`${readableRange}, ${t('nights', { count: nights })}`}
                onEdit={() => goBack(STEPS.indexOf('dates'))}
                editLabel={t('edit')}
              />
              <RecapRow
                icon="personCard"
                label={t('questions.name')}
                value={name.trim()}
                onEdit={() => goBack(STEPS.indexOf('name'))}
                editLabel={t('edit')}
              />
              <RecapRow
                icon="at"
                label={t('questions.email')}
                value={email.trim()}
                onEdit={() => goBack(STEPS.indexOf('email'))}
                editLabel={t('edit')}
              />
              <RecapRow
                icon="phone"
                label={t('questions.phone')}
                value={fullPhoneNumber(country, phone)}
                onEdit={() => goBack(STEPS.indexOf('phone'))}
                editLabel={t('edit')}
              />
              <RecapRow
                icon="person"
                label={t('questions.guests')}
                value={String(guests ?? '')}
                onEdit={() => goBack(STEPS.indexOf('guests'))}
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
                <>
                  <Icon name="checkCircle" className="h-[1.05em] w-auto" />
                  {t('submit')}
                </>
              )}
            </button>

            <p className="mt-3 text-center text-xs text-ink-soft">{t('noPayment')}</p>

            <p className="mt-1 text-center text-xs text-ink-soft">
              {t.rich('consentNotice', {
                link: (chunks) => (
                  <a className="text-raspberry-ink underline underline-offset-4" href={privacyHref}>
                    {chunks}
                  </a>
                ),
              })}
            </p>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => goBack(recapIndex - 1)}
                className="text-sm text-ink-soft underline underline-offset-4"
              >
                {t('back')}
              </button>
            </div>
          </div>
        );
    }
  }

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
        className="t-resize overflow-hidden"
        style={frameHeight ? { height: `${frameHeight}px` } : undefined}
      >
        <div ref={stageRef}>{stepContent()}</div>
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

      {/* Centred by its wrapper rather than stretched: only the word itself
          answers to the pointer. */}
      {onBack && backLabel ? (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-ink-soft underline underline-offset-4"
          >
            {backLabel}
          </button>
        </div>
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
  icon,
  label,
  value,
  onEdit,
  editLabel,
}: {
  icon: IconName;
  label: string;
  value: string;
  onEdit: () => void;
  editLabel: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <div className="min-w-0">
        <dt className="flex items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-ink-soft">
          <Icon name={icon} className="h-3.5 w-auto shrink-0" />
          {label}
        </dt>
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
