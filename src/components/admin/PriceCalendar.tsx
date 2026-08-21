'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { clearOverrideAction, setOverrideAction } from '@/app/admin/actions';
import { FormFeedback } from '@/components/admin/FormFeedback';
import type { CalendarNight } from '@/lib/admin-data';
import { IDLE, type ActionState } from '@/lib/admin-forms';
import {
  WEEKDAY_LABELS,
  addMonths,
  longDateLabel,
  monthLabel,
  weeksOf,
} from '@/lib/calendar';
import { addDays, nightsBetween } from '@/lib/dates';
import { bareAmount } from '@/lib/money';

/**
 * The month, the way Corine already thinks about her prices.
 *
 * Every figure in it is the resolved price from the lot 1 engine, so the grid
 * is not a preview of the rules, it is the rules. That is the point: the
 * deposit is charged automatically, so the only way to catch a last minute
 * setting that has gone wrong is to see what it is doing to next week.
 *
 * The month lives in the URL rather than in state, so paging is an ordinary
 * navigation the server answers with fresh prices, and a month can be reloaded
 * or bookmarked. Selection is the only thing held here.
 *
 * A booked night is not selectable. It still shows its price, and it says who
 * is holding it; what it will not do is let a manual price be posted over a
 * figure already agreed with a guest.
 */

const BUSY_LABELS: Record<string, string> = {
  reservation: 'Réservé',
  manual: 'Bloqué',
  external: 'Importé',
};

const LAYER_LABELS: Record<string, string> = {
  base: 'prix par défaut',
  tier: 'saison',
  last_minute: 'remise',
  override: 'prix manuel',
};

const LAYER_TAGS: Record<string, string> = {
  base: '',
  tier: 'saison',
  last_minute: 'remise',
  override: 'manuel',
};

function busyLabel(night: CalendarNight): string | null {
  if (!night.busy) return null;
  if (night.busy === 'external') {
    if (night.platform === 'airbnb') return 'Airbnb';
    if (night.platform === 'booking') return 'Booking';
    return BUSY_LABELS.external;
  }
  return BUSY_LABELS[night.busy];
}

export function PriceCalendar({
  monthStart,
  today,
  nights,
  hasUnpricedNights,
}: {
  monthStart: string;
  today: string;
  nights: CalendarNight[];
  hasUnpricedNights: boolean;
}) {
  const router = useRouter();
  const [paging, startPaging] = useTransition();

  const [anchor, setAnchor] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  const [setState, setAction, setPending] = useActionState<ActionState, FormData>(
    setOverrideAction,
    IDLE,
  );
  const [clearState, clearAction, clearPending] = useActionState<ActionState, FormData>(
    clearOverrideAction,
    IDLE,
  );

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarNight>();
    for (const night of nights) map.set(night.date, night);
    return map;
  }, [nights]);

  const weeks = useMemo(() => weeksOf(monthStart), [monthStart]);

  // A selection belongs to the month it was made in.
  useEffect(() => {
    setAnchor(null);
    setEnd(null);
  }, [monthStart]);

  // Once the write has landed the grid below is already the new truth, so the
  // selection has done its job and gets out of the way.
  useEffect(() => {
    if (setState.status === 'ok' || clearState.status === 'ok') {
      setAnchor(null);
      setEnd(null);
    }
  }, [setState, clearState]);

  const range = useMemo(() => {
    if (!anchor) return null;
    const other = end ?? anchor;
    return anchor <= other ? { first: anchor, last: other } : { first: other, last: anchor };
  }, [anchor, end]);

  function pick(date: string): void {
    if (anchor === null || end !== null) {
      setAnchor(date);
      setEnd(null);
      return;
    }
    setEnd(date);
  }

  function page(offset: number): void {
    const target = addMonths(monthStart, offset).slice(0, 7);
    startPaging(() => router.push(`/admin?m=${target}`, { scroll: false }));
  }

  // The grid selects nights inclusively, so both ends count.
  const selectedNights = range ? nightsBetween(range.first, range.last) + 1 : 0;

  const firstSelected = range ? byDate.get(range.first) : undefined;
  const suggested =
    firstSelected?.override ?? (firstSelected?.price !== null ? firstSelected?.price : null);

  return (
    <section className="admin-section" aria-labelledby="admin-calendar-title">
      <h2 className="admin-section-title" id="admin-calendar-title">
        Calendrier
      </h2>
      <p className="admin-section-lead">
        Le prix réellement appliqué à chaque nuit, remise comprise. Cliquez une nuit, puis une
        seconde pour prendre une plage.
      </p>

      <div className="admin-calendar" data-pending={paging ? '' : undefined}>
        <div className="admin-calendar-bar">
          <button
            type="button"
            className="admin-btn admin-btn-quiet"
            onClick={() => page(-1)}
            disabled={paging}
          >
            <span aria-hidden="true">&larr;</span> Mois précédent
          </button>
          <h3 className="admin-calendar-month">{monthLabel(monthStart)}</h3>
          <button
            type="button"
            className="admin-btn admin-btn-quiet"
            onClick={() => page(1)}
            disabled={paging}
          >
            Mois suivant <span aria-hidden="true">&rarr;</span>
          </button>
        </div>

        <table className="admin-grid-table">
          <caption className="visually-hidden">
            Prix par nuit pour {monthLabel(monthStart)}. Les nuits réservées ne sont pas
            modifiables.
          </caption>
          <thead>
            <tr>
              {WEEKDAY_LABELS.map((day) => (
                <th key={day} scope="col">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.find(Boolean) ?? String(week.length)}>
                {week.map((date, index) => {
                  if (!date) return <td key={`pad-${index}`} className="admin-day-pad" />;

                  const night = byDate.get(date);
                  const busy = night ? busyLabel(night) : null;
                  const selected = range ? date >= range.first && date <= range.last : false;
                  const layer = night?.layer ?? 'base';

                  return (
                    <td key={date}>
                      <button
                        type="button"
                        className="admin-day"
                        data-layer={layer}
                        data-busy={night?.busy ?? undefined}
                        data-selected={selected ? '' : undefined}
                        data-today={date === today ? '' : undefined}
                        disabled={Boolean(night?.busy)}
                        aria-pressed={selected}
                        onClick={() => pick(date)}
                        title={`${longDateLabel(date)} : ${LAYER_LABELS[layer] ?? layer}`}
                      >
                        <span className="admin-day-number">{Number(date.slice(8, 10))}</span>
                        <span className="admin-day-price">
                          {night && night.price !== null ? bareAmount(night.price) : '?'}
                        </span>
                        <span className="admin-day-tag">{busy ?? LAYER_TAGS[layer] ?? ''}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="admin-legend">
          <li data-layer="base">Prix par défaut</li>
          <li data-layer="tier">Saison</li>
          <li data-layer="last_minute">Remise dernière minute</li>
          <li data-layer="override">Prix manuel</li>
          <li data-busy="reservation">Réservé ou bloqué</li>
        </ul>

        {hasUnpricedNights ? (
          <p className="admin-note admin-note-warn">
            Un ? remplace le prix des nuits dont le tarif n&rsquo;est pas encore réglé. Renseignez
            le prix de nuit par défaut et le tarif de chaque saison plus haut.
          </p>
        ) : null}
      </div>

      <div className="admin-override-panel">
        {range ? (
          <>
            <p className="admin-override-summary">
              {selectedNights} nuit{selectedNights > 1 ? 's' : ''} sélectionnée
              {selectedNights > 1 ? 's' : ''},{' '}
              {selectedNights === 1
                ? `la nuit du ${longDateLabel(range.first)}`
                : `du ${longDateLabel(range.first)} au ${longDateLabel(range.last)}`}
              .
            </p>

            <div className="admin-override-forms">
              <form action={setAction} className="admin-override-form">
                <input type="hidden" name="from" value={range.first} />
                <input type="hidden" name="to" value={addDays(range.last, 1)} />
                <label className="admin-field">
                  <span className="admin-label">Prix manuel</span>
                  <span className="admin-input-money">
                    <input
                      key={`${range.first}-${range.last}`}
                      type="text"
                      inputMode="decimal"
                      name="nightly_rate"
                      defaultValue={
                        suggested === null || suggested === undefined ? '' : String(suggested)
                      }
                      className="admin-input"
                      required
                    />
                    <span aria-hidden="true">€</span>
                  </span>
                </label>
                <button
                  type="submit"
                  className="admin-btn admin-btn-primary"
                  disabled={setPending || clearPending}
                >
                  {setPending ? 'Application...' : 'Appliquer ce prix'}
                </button>
              </form>

              <form action={clearAction} className="admin-override-form">
                <input type="hidden" name="from" value={range.first} />
                <input type="hidden" name="to" value={addDays(range.last, 1)} />
                <button
                  type="submit"
                  className="admin-btn admin-btn-secondary"
                  disabled={setPending || clearPending}
                >
                  {clearPending ? 'Retrait...' : 'Revenir au prix automatique'}
                </button>
              </form>

              <button
                type="button"
                className="admin-btn admin-btn-quiet"
                onClick={() => {
                  setAnchor(null);
                  setEnd(null);
                }}
              >
                Annuler la sélection
              </button>
            </div>
          </>
        ) : (
          <p className="admin-override-summary admin-override-empty">
            Aucune nuit sélectionnée. Cliquez une nuit libre pour lui poser un prix, puis une
            seconde pour couvrir toute une plage.
          </p>
        )}

        <FormFeedback state={setState} />
        <FormFeedback state={clearState} />
      </div>
    </section>
  );
}
