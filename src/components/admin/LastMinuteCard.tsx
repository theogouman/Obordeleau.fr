'use client';

import { useActionState, useMemo, useState } from 'react';
import { saveLastMinuteAction } from '@/app/admin/actions';
import { FormFeedback } from '@/components/admin/FormFeedback';
import type { LastMinuteRow, TierRow } from '@/lib/admin-data';
import { IDLE, type ActionState } from '@/lib/admin-forms';
import { monthName, monthsCovered } from '@/lib/calendar';
import { euros } from '@/lib/money';

/**
 * The one setting that moves prices on its own.
 *
 * Because the deposit is taken automatically, a discount left switched on with
 * the wrong numbers sells nights cheap without anyone deciding to. So the card
 * restates the live rule as a sentence built from the fields as they are typed,
 * not from what was last saved: what it says is what the engine will do.
 */

function text(input: number | null | undefined): string {
  return input === null || input === undefined ? '' : String(input);
}

function toNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (cleaned === '') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function joinFrench(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

/** Named from the seasons themselves, so a new exempt season renames itself. */
function exemptSentence(tiers: TierRow[]): string | null {
  const months = new Set<number>();
  for (const tier of tiers) {
    if (!tier.is_last_minute_exempt) continue;
    for (const month of monthsCovered(tier.start_date, tier.end_date)) months.add(month);
  }
  if (months.size === 0) return null;

  const names = [...months].sort((a, b) => a - b).map(monthName);
  const list = joinFrench(names);
  const capitalised = list.charAt(0).toUpperCase() + list.slice(1);
  return names.length === 1 ? `${capitalised} est exclu.` : `${capitalised} sont exclus.`;
}

export function LastMinuteCard({
  lastMinute,
  tiers,
}: {
  lastMinute: LastMinuteRow | null;
  tiers: TierRow[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    saveLastMinuteAction,
    IDLE,
  );

  const [enabled, setEnabled] = useState(lastMinute?.enabled ?? false);
  const [windowDays, setWindowDays] = useState(text(lastMinute?.window_days));
  const [discounted, setDiscounted] = useState(text(lastMinute?.discounted_price));
  const [floor, setFloor] = useState(text(lastMinute?.floor_price));

  const exempt = useMemo(() => exemptSentence(tiers), [tiers]);

  const summary = useMemo(() => {
    if (!enabled) {
      return 'La remise dernière minute est désactivée. Chaque nuit garde son prix normal.';
    }

    const days = toNumber(windowDays);
    const cut = toNumber(discounted);
    const bottom = toNumber(floor);

    if (days === null || cut === null || bottom === null) {
      return 'Renseignez la fenêtre, le prix remisé et le prix plancher : la remise ne peut pas être activée tant qu’il en manque un.';
    }

    const applied = Math.max(cut, bottom);
    const opening =
      days === 0
        ? `Seule la nuit de ce soir, si elle est encore libre, sera proposée à ${euros(applied)}`
        : `Toute nuit encore libre dans les ${days} prochains jours sera proposée à ${euros(applied)}`;

    const parts = [`${opening}, sans jamais descendre sous ${euros(bottom)}.`];

    if (cut < bottom) {
      parts.push(
        `Le prix remisé saisi (${euros(cut)}) passe sous le plancher, c’est donc le plancher qui s’applique.`,
      );
    }
    if (exempt) parts.push(exempt);
    parts.push('Une nuit déjà réservée garde son prix.');

    return parts.join(' ');
  }, [enabled, windowDays, discounted, floor, exempt]);

  return (
    <form action={action} className="admin-card">
      <h3 className="admin-card-title">Remise dernière minute</h3>

      <div className="admin-toggle-row">
        <label className="admin-toggle">
          <input
            type="checkbox"
            name="enabled"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span className="admin-toggle-track" aria-hidden="true">
            <span className="admin-toggle-thumb" />
          </span>
          <span className="admin-toggle-label">{enabled ? 'Active' : 'Désactivée'}</span>
        </label>
      </div>

      <div className="admin-field-row">
        <label className="admin-field">
          <span className="admin-label">Fenêtre</span>
          <span className="admin-input-money">
            <input
              type="number"
              min="0"
              step="1"
              name="window_days"
              value={windowDays}
              onChange={(event) => setWindowDays(event.target.value)}
              className="admin-input"
            />
            <span aria-hidden="true">jours</span>
          </span>
        </label>

        <label className="admin-field">
          <span className="admin-label">Prix remisé</span>
          <span className="admin-input-money">
            <input
              type="text"
              inputMode="decimal"
              name="discounted_price"
              value={discounted}
              onChange={(event) => setDiscounted(event.target.value)}
              className="admin-input"
            />
            <span aria-hidden="true">€</span>
          </span>
        </label>

        <label className="admin-field">
          <span className="admin-label">Prix plancher</span>
          <span className="admin-input-money">
            <input
              type="text"
              inputMode="decimal"
              name="floor_price"
              value={floor}
              onChange={(event) => setFloor(event.target.value)}
              className="admin-input"
            />
            <span aria-hidden="true">€</span>
          </span>
        </label>
      </div>

      <p className="admin-rule-summary" aria-live="polite">
        {summary}
      </p>

      <div className="admin-actions">
        <button type="submit" className="admin-btn admin-btn-primary" disabled={pending}>
          {pending ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
