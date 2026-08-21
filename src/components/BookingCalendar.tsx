'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { localeTags, type Locale } from '@/i18n/routing';
import { addDays } from '@/lib/dates';

/**
 * Range picker over real availability.
 *
 * Nights are named by the date they start on, so a range [arrival, departure)
 * leaves the departure day free: a checkout date can be the next guest's
 * arrival, exactly as an exclusive iCal DTEND means.
 *
 * Everything here is a hint. The server re-applies the whole rule on submit,
 * because a night can go while the visitor is choosing.
 *
 * Paging between months is transitions.dev page side by side (08), on the
 * values that snippet ships: the month on screen leaves in the direction of
 * travel while it fades and blurs, and only once it is gone does the next one
 * arrive from the other side.
 */

const MONTH_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** --page-slide-distance */
const MONTH_SHIFT = 8;
/** --page-blur */
const MONTH_BLUR = 3;
/** --page-slide-dur and --page-fade-dur, which the snippet keeps equal. */
const MONTH_DUR = 250;

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

type Props = {
  blocked: ReadonlySet<string>;
  firstArrival: string;
  /** Exclusive: the first date the window no longer covers. */
  windowEnd: string;
  arrival: string | null;
  departure: string | null;
  onChange: (arrival: string | null, departure: string | null) => void;
  status: 'loading' | 'ready' | 'error';
  onRetry: () => void;
};

/* -------------------------------------------------------------------------- */
/* Calendar arithmetic, all on plain YYYY-MM-DD strings                       */
/* -------------------------------------------------------------------------- */

function startOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${startOfMonth(isoDate)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

/** 0 is Monday: France, the United Kingdom and Germany all start there. */
function weekdayIndex(isoDate: string): number {
  return (new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function daysInMonth(isoDate: string): number {
  const date = new Date(`${startOfMonth(isoDate)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.getUTCDate();
}

/** The same day one month away, clamped to the last day of a shorter month. */
function shiftMonths(isoDate: string, months: number): string {
  const target = addMonths(isoDate, months);
  const day = Math.min(Number(isoDate.slice(8, 10)), daysInMonth(target));
  return addDays(target, day - 1);
}

function weeksOf(monthStart: string): (string | null)[][] {
  const cells: (string | null)[] = Array<string | null>(weekdayIndex(monthStart)).fill(null);

  for (let day = 0; day < daysInMonth(monthStart); day += 1) {
    cells.push(addDays(monthStart, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

/* -------------------------------------------------------------------------- */

export function BookingCalendar({
  blocked,
  firstArrival,
  windowEnd,
  arrival,
  departure,
  onChange,
  status,
  onRetry,
}: Props) {
  const t = useTranslations('reservation.calendar');
  // Month and weekday names come from Intl, never from a list in a message file.
  const localeTag = localeTags[useLocale() as Locale];
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(arrival ?? firstArrival));
  const [focused, setFocused] = useState(() => arrival ?? firstArrival);
  const [moveFocus, setMoveFocus] = useState(false);
  const tooltipId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const paging = useRef<1 | -1>(1);
  const sliding = useRef(false);
  const paged = useRef(false);

  const monthName = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    [localeTag],
  );
  const dayName = useMemo(
    () => new Intl.DateTimeFormat(localeTag, { dateStyle: 'full', timeZone: 'UTC' }),
    [localeTag],
  );

  const weekdays = useMemo(() => {
    const short = new Intl.DateTimeFormat(localeTag, { weekday: 'short', timeZone: 'UTC' });
    const long = new Intl.DateTimeFormat(localeTag, { weekday: 'long', timeZone: 'UTC' });
    // 2024-01-01 was a Monday, which makes it a convenient seed.
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(`2024-01-0${index + 1}T00:00:00Z`);
      return { short: short.format(date), long: long.format(date) };
    });
  }, [localeTag]);

  /**
   * With an arrival chosen, the stay may run up to the first taken night and
   * no further: that night's date is still a valid checkout.
   */
  const maxCheckout = useMemo(() => {
    if (!arrival) return null;
    let cursor = addDays(arrival, 1);
    while (cursor < windowEnd && !blocked.has(cursor)) cursor = addDays(cursor, 1);
    return cursor;
  }, [arrival, blocked, windowEnd]);

  const pickingDeparture = arrival !== null && departure === null;

  function isSelectable(date: string): boolean {
    // Nothing is offered until the real availability is in: an empty set of
    // blocked nights is "not known yet", never "everything is free".
    if (status !== 'ready') return false;
    if (date < firstArrival || date >= windowEnd) return false;
    if (pickingDeparture && arrival) {
      return date > arrival && (maxCheckout === null || date <= maxCheckout);
    }
    return !blocked.has(date);
  }

  function select(date: string) {
    if (!isSelectable(date)) return;

    if (pickingDeparture && arrival && date > arrival) {
      onChange(arrival, date);
      return;
    }
    onChange(date, null);
  }

  function move(to: string, event: KeyboardEvent) {
    event.preventDefault();
    const clamped = to < firstArrival ? firstArrival : to >= windowEnd ? addDays(windowEnd, -1) : to;
    setFocused(clamped);
    setMoveFocus(true);
    // The focused date always sits in the first rendered month: the second one
    // is a preview, and it is hidden on a narrow screen.
    if (clamped < visibleMonth || clamped >= addMonths(visibleMonth, 1)) {
      setVisibleMonth(startOfMonth(clamped));
    }
  }

  /**
   * Paging with the arrows has to carry the focused date along, otherwise no
   * day holds the single tab stop and the grid drops out of the tab order.
   */
  function showMonth(offset: number) {
    const next = addMonths(visibleMonth, offset);
    setVisibleMonth(next);

    if (focused >= next && focused < addMonths(next, 1)) return;
    const target = next > firstArrival ? next : firstArrival;
    setFocused(target < windowEnd ? target : addDays(windowEnd, -1));
  }

  function goToMonth(offset: number) {
    const grid = gridRef.current;
    if (!grid || reducedMotion()) {
      showMonth(offset);
      return;
    }

    if (sliding.current) return;
    sliding.current = true;
    paged.current = true;
    paging.current = offset > 0 ? 1 : -1;

    grid.getAnimations().forEach((animation) => animation.cancel());
    const exit = grid.animate(
      [
        { transform: 'translateX(0)', opacity: 1, filter: 'blur(0px)' },
        {
          transform: `translateX(${-MONTH_SHIFT * paging.current}px)`,
          opacity: 0,
          filter: `blur(${MONTH_BLUR}px)`,
        },
      ],
      { duration: MONTH_DUR, easing: MONTH_EASE, fill: 'forwards' },
    );

    exit.onfinish = () => {
      sliding.current = false;
      showMonth(offset);
    };
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowLeft':
        return move(addDays(focused, -1), event);
      case 'ArrowRight':
        return move(addDays(focused, 1), event);
      case 'ArrowUp':
        return move(addDays(focused, -7), event);
      case 'ArrowDown':
        return move(addDays(focused, 7), event);
      case 'Home':
        return move(addDays(focused, -weekdayIndex(focused)), event);
      case 'End':
        return move(addDays(focused, 6 - weekdayIndex(focused)), event);
      case 'PageUp':
        return move(shiftMonths(focused, -1), event);
      case 'PageDown':
        return move(shiftMonths(focused, 1), event);
      default:
    }
  }

  // The server has the last word on the earliest arrival, and it can land a day
  // after what the browser guessed. Keep the focused date inside the window.
  useEffect(() => {
    if (focused >= firstArrival) return;
    setFocused(firstArrival);
    setVisibleMonth((current) =>
      current < startOfMonth(firstArrival) ? startOfMonth(firstArrival) : current,
    );
  }, [firstArrival, focused]);

  // The month that has just arrived, entering from the side the travel came
  // from. Keyboard paging is deliberately left out: it moves the focus at the
  // same time, and a focus landing inside a blurred, half moved grid is worse
  // than no movement at all.
  useEffect(() => {
    if (!paged.current) return;
    paged.current = false;

    const grid = gridRef.current;
    if (!grid || reducedMotion()) return;

    grid.getAnimations().forEach((animation) => animation.cancel());
    grid.animate(
      [
        {
          transform: `translateX(${MONTH_SHIFT * paging.current}px)`,
          opacity: 0,
          filter: `blur(${MONTH_BLUR}px)`,
        },
        { transform: 'translateX(0)', opacity: 1, filter: 'blur(0px)' },
      ],
      { duration: MONTH_DUR, easing: MONTH_EASE, fill: 'both' },
    );
  }, [visibleMonth]);

  // Only chase the focus after a key press, never on first paint: landing on a
  // date on load would drag the page down to the calendar.
  useEffect(() => {
    if (!moveFocus) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
    setMoveFocus(false);
  }, [focused, moveFocus]);

  const months = [visibleMonth, addMonths(visibleMonth, 1)];
  const canGoBack = visibleMonth > startOfMonth(firstArrival);
  const canGoForward = addMonths(visibleMonth, 1) < windowEnd;

  function dayState(date: string) {
    const isArrival = date === arrival;
    const isDeparture = date === departure;
    const inRange = arrival !== null && departure !== null && date > arrival && date < departure;
    const selectable = isSelectable(date);

    return { isArrival, isDeparture, inRange, selectable };
  }

  function dayClasses(date: string): string {
    const { isArrival, isDeparture, inRange, selectable } = dayState(date);
    const base =
      'relative flex h-10 w-full items-center justify-center rounded-[var(--radius-card)] text-sm transition-colors';

    if (isArrival || isDeparture) return `${base} bg-raspberry font-semibold text-white`;
    if (inRange) return `${base} bg-sand font-medium text-ink`;
    if (blocked.has(date)) return `${base} cursor-not-allowed text-ink-soft/45 line-through`;
    if (!selectable) return `${base} cursor-not-allowed text-ink-soft/40`;
    return `${base} hover:bg-sand focus-visible:bg-sand`;
  }

  function dayLabel(date: string): string {
    const readable = dayName.format(new Date(`${date}T00:00:00Z`));
    const { isArrival, isDeparture, selectable } = dayState(date);

    if (isArrival) return `${readable}, ${t('arrival')}`;
    if (isDeparture) return `${readable}, ${t('departure')}`;
    if (!selectable && status === 'ready') return `${readable}, ${t('unavailable')}`;
    return readable;
  }

  if (status === 'error') {
    return (
      <div className="rounded-[var(--radius-card)] border border-[rgba(58,42,38,0.22)] p-6 text-center">
        <p className="text-ink-soft">{t('loadError')}</p>
        <button type="button" onClick={onRetry} className="btn btn-secondary mt-4">
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-[rgba(58,42,38,0.22)] p-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goToMonth(-1)}
          disabled={!canGoBack}
          aria-label={t('previousMonth')}
          className="flex size-9 items-center justify-center rounded-full border border-[rgba(58,42,38,0.22)] disabled:opacity-35"
        >
          <Chevron direction="left" />
        </button>

        <p className="text-sm font-medium text-ink-soft" aria-live="polite">
          {pickingDeparture ? t('chooseDeparture') : t('chooseArrival')}
        </p>

        <button
          type="button"
          onClick={() => goToMonth(1)}
          disabled={!canGoForward}
          aria-label={t('nextMonth')}
          className="flex size-9 items-center justify-center rounded-full border border-[rgba(58,42,38,0.22)] disabled:opacity-35"
        >
          <Chevron direction="right" />
        </button>
      </div>

      {/* Container query, not a viewport one: the calendar sits in a column whose
          width has nothing to do with the size of the screen. The container is
          the wrapper, because an element never queries itself. */}
      <div className="@container/cal mt-4">
      <div
        ref={gridRef}
        onKeyDown={onKeyDown}
        className="grid gap-6 @[30rem]/cal:grid-cols-2"
        aria-busy={status === 'loading'}
      >
        {months.map((month, index) => (
          <table
            key={month}
            className={`w-full border-collapse ${index === 1 ? 'hidden @[30rem]/cal:table' : ''}`}
          >
            <caption className="mb-2 font-display text-lg capitalize">
              {monthName.format(new Date(`${month}T00:00:00Z`))}
            </caption>
            <thead>
              <tr>
                {weekdays.map((weekday) => (
                  <th key={weekday.long} scope="col" className="pb-1 text-xs font-medium text-ink-soft">
                    <abbr title={weekday.long} className="no-underline">
                      {weekday.short}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeksOf(month).map((week) => (
                <tr key={String(week.find(Boolean))}>
                  {week.map((date, cell) => (
                    <td key={date ?? `empty-${cell}`} className="p-0.5 text-center">
                      {date ? (
                        <span className="t-tt-wrap block">
                          <button
                            type="button"
                            data-date={date}
                            tabIndex={date === focused ? 0 : -1}
                            aria-disabled={!isSelectable(date) || undefined}
                            aria-current={
                              date === arrival || date === departure ? 'date' : undefined
                            }
                            aria-label={dayLabel(date)}
                            aria-describedby={blocked.has(date) ? `${tooltipId}-${date}` : undefined}
                            onClick={() => select(date)}
                            onFocus={() => setFocused(date)}
                            className={`${dayClasses(date)} ${blocked.has(date) ? 't-tt-trigger' : ''}`}
                          >
                            <span aria-hidden="true">{Number(date.slice(8, 10))}</span>
                          </button>
                          {blocked.has(date) ? (
                            <span className="t-tt text-xs font-medium" id={`${tooltipId}-${date}`} role="tooltip">
                              {t('taken')}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
        {status === 'loading' ? <span>{t('loading')}</span> : null}
        {arrival ? (
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className="ms-auto text-raspberry-ink underline underline-offset-4"
          >
            {t('clear')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
