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
import { ChannelChoice } from '@/components/ChannelChoice';
import { Icon } from '@/components/Icon';
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
 *
 * Going back is one control in the top corner of the card rather than one per
 * question, so it stays exactly where it was found while the questions move.
 */

type Props = {
  maxGuests: number;
  privacyHref: string;
  whatsappNumber: string;
  airbnbUrl?: string;
  bookingUrl?: string;
};

type Availability = {
  blocked: ReadonlySet<string>;
  firstArrival: string;
  windowEnd: string;
  country: string | null;
};

type StepId = 'dates' | 'name' | 'email' | 'phone' | 'guests' | 'recap';

const STEPS: readonly StepId[] = ['dates', 'name', 'email', 'phone', 'guests', 'recap'];
const RECAP = STEPS.indexOf('recap');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PHONE_DIGITS = 6;
const SHAKE_MS = 280;
const STEP_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const STEP_SHIFT = 34;
const STEP_OUT_MS = 240;
const STEP_IN_MS = 300;
/**
 * The frame that clips the moving question also clipped the focus ring of the
 * field inside it. It now holds every step away from its own edges, 16px to the
 * sides and this much above and below, and takes the room back out of the
 * card's own padding, so the ring is drawn in full and nothing has moved.
 */
const FRAME_INSET_Y = 8;

/**
 * The two controls in the top corners of the card: a white ground and a soft
 * outline, small enough that neither of them competes with the question. The
 * row stretches them, so the one carrying two lines and the one carrying a
 * single word still come out the same height.
 */
const CHIP =
  'inline-flex items-center gap-1.5 rounded-[10px] border border-[rgba(58,42,38,0.14)] bg-shell px-2.5 py-1.5 text-xs text-ink transition-colors hover:border-ink';

/** The chip is a glance, not a sentence: 08/07/2026, not 8 juillet 2026. */
function shortDate(isoDate: string | null): string {
  if (!isoDate) return '';
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;
}

const EMPTY_BLOCKED: ReadonlySet<string> = new Set<string>();

export function BookingForm({
  maxGuests,
  privacyHref,
  whatsappNumber,
  airbnbUrl,
  bookingUrl,
}: Props) {
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
  const [guestFocus, setGuestFocus] = useState(0);
  // The step to come back to once the question now on screen has been dealt
  // with. Set when a single answer is reopened, from the recap or from the
  // dates chip, so nothing already answered is ever asked twice.
  const [returnTo, setReturnTo] = useState<number | null>(null);

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
  const channelRef = useRef<HTMLDivElement>(null);
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

  /* --- the two platforms, opening and closing on card resize (01) --------- */

  /*
   * They belong to the calendar, and only to it: whatever dates are picked,
   * they stay until the first question of the form, and from there they are
   * gone. They do not vanish either. The block is held in a frame whose height
   * is tweened between nought and what the content measures, on card resize
   * (01), with the content fading on the same beat, so it folds away and
   * unfolds back rather than being cut out of the card.
   */
  // No platform configured means no frame at all, not an empty one.
  const hasChannels = Boolean(airbnbUrl || bookingUrl);
  const wantChannels = stepIndex === 0;
  const [channelsMounted, setChannelsMounted] = useState(true);
  const [channelHeight, setChannelHeight] = useState<number | null>(null);
  const channelsSettled = useRef(false);

  useEffect(() => {
    // The first pass is the initial paint, which has nothing to animate.
    if (!channelsSettled.current) {
      channelsSettled.current = true;
      return;
    }

    if (reducedMotion()) {
      setChannelHeight(null);
      setChannelsMounted(wantChannels);
      return;
    }

    if (wantChannels) {
      // Mounted flat, then grown by the effect below once it can be measured.
      setChannelHeight(0);
      setChannelsMounted(true);
      return;
    }

    const inner = channelRef.current;
    if (!inner) {
      setChannelsMounted(false);
      return;
    }

    setChannelHeight(inner.offsetHeight);
    const frame = requestAnimationFrame(() => setChannelHeight(0));
    return () => cancelAnimationFrame(frame);
  }, [wantChannels]);

  useEffect(() => {
    if (!channelsMounted || !wantChannels || channelHeight !== 0) return;
    const inner = channelRef.current;
    if (!inner) return;

    const frame = requestAnimationFrame(() => setChannelHeight(inner.offsetHeight));
    return () => cancelAnimationFrame(frame);
  }, [channelsMounted, wantChannels, channelHeight]);

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
    if (returnTo !== null) {
      const target = returnTo;
      setReturnTo(null);
      goTo(target);
      return;
    }
    goTo(Math.min(stepIndex + 1, STEPS.length - 1));
  }

  /** The one control in the corner of the card. */
  function back() {
    if (returnTo !== null) {
      const target = returnTo;
      setReturnTo(null);
      goTo(target);
      return;
    }
    goBack(stepIndex - 1);
  }

  /** A question reopened on its own, and returning to wherever it was left. */
  function correct(index: number, from = stepIndex) {
    setReturnTo(from);
    goBack(index);
  }

  // Choosing is answering: the recap follows on its own, after just long
  // enough for the chosen box to be seen taking the answer.
  function chooseGuests(count: number) {
    setGuests(count);
    setGuestFocus(count - 1);
    setStepError(null);
    setReturnTo(null);
    window.setTimeout(() => goTo(RECAP), 160);
  }

  // Arrows move the focus without answering, so walking through the four boxes
  // never skips the question.
  function onGuestKeys(event: KeyboardEvent<HTMLDivElement>) {
    const last = maxGuests - 1;
    const target =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? Math.min(guestFocus + 1, last)
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? Math.max(guestFocus - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;

    if (target === null) return;
    event.preventDefault();
    setGuestFocus(target);
    const group = event.currentTarget;
    window.requestAnimationFrame(() =>
      group.querySelector<HTMLElement>(`[data-guests="${target + 1}"]`)?.focus(),
    );
  }

  // The question opens on the answer already given, not back at one.
  useEffect(() => {
    if (STEPS[stepIndex] === 'guests') setGuestFocus(guests === null ? 0 : guests - 1);
    // Moving the focus is not answering, so the answer itself is not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

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
        setReturnTo(null);
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

  function stepContent() {
    switch (step) {
      case 'dates':
        return (
          <Step
            onNext={next}
            nextLabel={t('continue')}
            nextDisabled={nights < 1}
            nextHint={t('datesTooltip')}
            error={stepError}
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
              {nights > 0 ? `${readableRange}, ${t('nights', { count: nights })}` : t('noDatesYet')}
            </p>
          </Step>
        );

      case 'name':
        return (
          <Step
            onNext={next}
            nextLabel={t('continue')}
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
          <Step error={stepError}>
            <fieldset>
              <legend className="font-display text-xl">{t('questions.guests')}</legend>
              <div
                role="radiogroup"
                aria-label={t('questions.guests')}
                onKeyDown={onGuestKeys}
                className="mt-4 grid grid-cols-4 gap-2"
              >
                {Array.from({ length: maxGuests }, (_, seat) => seat + 1).map((count) => (
                  <button
                    key={count}
                    type="button"
                    role="radio"
                    aria-checked={guests === count}
                    tabIndex={count - 1 === guestFocus ? 0 : -1}
                    data-guests={count}
                    data-autofocus={count - 1 === guestFocus ? true : undefined}
                    onClick={() => chooseGuests(count)}
                    className={`flex flex-col items-center justify-center rounded-[var(--radius-card)] border py-3 transition-colors ${
                      guests === count
                        ? 'border-raspberry bg-[rgba(206,66,87,0.07)] text-raspberry-ink'
                        : 'border-[rgba(58,42,38,0.18)] text-ink-soft hover:border-ink'
                    }`}
                  >
                    {/* One silhouette per traveller, so the count is legible
                        before the digit is read. */}
                    <span className="flex h-4 items-end justify-center gap-px" aria-hidden="true">
                      {Array.from({ length: count }, (_, seat) => (
                        <Icon key={seat} name="person" className="h-3.5 w-auto" />
                      ))}
                    </span>
                    <span className="mt-1.5 text-sm font-semibold">{count}</span>
                  </button>
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

            <dl className="mt-4 space-y-2.5">
              <RecapRow
                label={t('questions.dates')}
                value={`${readableRange}, ${t('nights', { count: nights })}`}
                onEdit={() => correct(STEPS.indexOf('dates'))}
                editLabel={t('edit')}
              />
              <RecapRow
                label={t('questions.name')}
                value={name.trim()}
                onEdit={() => correct(STEPS.indexOf('name'))}
                editLabel={t('edit')}
              />
              <RecapRow
                label={t('questions.email')}
                value={email.trim()}
                onEdit={() => correct(STEPS.indexOf('email'))}
                editLabel={t('edit')}
              />
              <RecapRow
                label={t('questions.phone')}
                value={fullPhoneNumber(country, phone)}
                onEdit={() => correct(STEPS.indexOf('phone'))}
                editLabel={t('edit')}
              />
              <RecapRow
                label={t('questions.guests')}
                value={guests === null ? '' : t('guestsValue', { count: guests })}
                onEdit={() => correct(STEPS.indexOf('guests'))}
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
                  {t('submit')}
                  <Icon name="checkCircle" className="h-[1.05em] w-auto" />
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
          </div>
        );
    }
  }

  return (
    <div className="card px-6 py-8 sm:px-8 sm:py-10">
      {formError ? (
        <p
          role="alert"
          className="mb-7 rounded-[var(--radius-card)] bg-[rgba(206,66,87,0.1)] p-3 text-sm text-raspberry-ink"
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

      {/* Back belongs to the card, not to the question: it stays put while the
          questions move underneath it. The dates chosen sit opposite it, so
          they are readable and reopenable from every question. */}
      {stepIndex > 0 || returnTo !== null ? (
        <div className="mb-6 flex items-stretch justify-between gap-3">
          <button type="button" onClick={back} className={CHIP}>
            <Icon name="returnArrow" className="h-3 w-auto shrink-0" />
            {t('back')}
          </button>

          {stepIndex > 0 && nights > 0 ? (
            <button
              type="button"
              onClick={() => correct(0)}
              className={`${CHIP} text-end leading-tight`}
            >
              <Icon name="calendar" className="h-3.5 w-auto shrink-0" />
              <span className="block">
                <span className="block">
                  {t('range', {
                    from: shortDate(arrival),
                    to: shortDate(departure),
                  })}
                </span>
                <span className="block text-[0.6875rem] text-ink-soft">{t('changeDates')}</span>
              </span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        className="t-resize -mx-4 -my-2 overflow-hidden px-4 py-2"
        style={frameHeight ? { height: `${frameHeight + FRAME_INSET_Y * 2}px` } : undefined}
      >
        <div ref={stageRef}>{stepContent()}</div>
      </div>

      {hasChannels && channelsMounted ? (
        <div
          className="t-resize overflow-hidden"
          style={channelHeight === null ? undefined : { height: `${channelHeight}px` }}
          onTransitionEnd={(event) => {
            if (event.propertyName !== 'height' || event.target !== event.currentTarget) return;
            if (!wantChannels) setChannelsMounted(false);
            setChannelHeight(null);
          }}
        >
          <div
            ref={channelRef}
            className="pt-6 transition-opacity duration-200 ease-out"
            style={{ opacity: channelHeight === 0 ? 0 : 1 }}
          >
            <ChannelChoice
              locale={locale}
              airbnbUrl={airbnbUrl}
              bookingUrl={bookingUrl}
              calendarId="booking-form"
            />
          </div>
        </div>
      ) : null}
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
  /** Shown on hover while the button is refusing, through tooltip (17). */
  nextHint?: string;
};

function Step({ children, error, onNext, nextLabel, nextDisabled, nextHint }: StepProps) {
  return (
    <div className={`t-input-wrap ${error ? 'is-error' : ''}`}>
      {children}

      <p className="t-error-msg mt-2 text-sm text-raspberry-ink" role="alert">
        {error ?? ''}
      </p>

      {onNext && nextLabel ? (
        /* A disabled button dispatches no events of its own, so the reason it
           is refusing is hung on the wrapper, which does. */
        <div className={`t-tt-wrap mt-4 block w-full ${nextDisabled ? 'cursor-not-allowed' : ''}`}>
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="btn btn-primary w-full disabled:pointer-events-none disabled:opacity-45"
          >
            {nextLabel}
          </button>
          {nextDisabled && nextHint ? (
            <span role="tooltip" className="t-tt text-sm">
              {nextHint}
            </span>
          ) : null}
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

/**
 * One answer, in its own frame: the question at the top with the control that
 * reopens it, a rule, then the answer underneath. The control carries a filled
 * ground of its own so it reads as a key on the frame rather than as a word in
 * the sentence.
 */
/**
 * One answer, in its own frame: the question on a filled band at the top, a
 * rule, then the answer underneath with the control that reopens it on the
 * same line, so the eye reads the answer and the way to change it together.
 */
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
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[rgba(58,42,38,0.14)]">
      <dt className="bg-sand px-4 py-2 text-xs uppercase tracking-[0.14em] text-ink-soft">
        {label}
      </dt>
      <dd className="flex items-center justify-between gap-3 border-t border-[rgba(58,42,38,0.12)] py-2 pe-2 ps-4">
        <span className="min-w-0 truncate font-medium">{value}</span>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`${editLabel} : ${label}`}
          title={editLabel}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(58,42,38,0.18)] bg-sand text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          <Icon name="pencilSquare" className="h-4 w-auto" />
        </button>
      </dd>
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
