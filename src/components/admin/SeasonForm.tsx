'use client';

import { useActionState } from 'react';
import { saveTierAction } from '@/app/admin/actions';
import { FormFeedback } from '@/components/admin/FormFeedback';
import type { TierRow } from '@/lib/admin-data';
import { IDLE, type ActionState } from '@/lib/admin-forms';
import { longDateLabel } from '@/lib/calendar';
import { addDays } from '@/lib/dates';

/**
 * One season.
 *
 * The database keeps the range half open, like everything else here, but a
 * season that runs "to the 1st of September" reads as covering the 1st. So the
 * form asks for the last night and adds the day back on the way in: the person
 * filling it in never has to hold the convention in their head.
 *
 * The stay constraints are folded away and carry a warning, because they are
 * not a pricing preference: they are what the visitor's date picker allows, and
 * loosening them mid season lets through arrivals the property cannot take.
 */

function constraintSummary(tier: TierRow): string {
  const parts: string[] = [];

  parts.push(
    tier.checkin_constraint === 'saturday'
      ? 'Arrivée le samedi uniquement'
      : 'Arrivée possible tous les jours',
  );
  parts.push(`${tier.min_nights} nuit${tier.min_nights > 1 ? 's' : ''} au minimum`);

  if (tier.stay_multiple) {
    const steps = [1, 2, 3].map((step) => step * tier.stay_multiple!).join(', ');
    parts.push(`par multiples de ${tier.stay_multiple} (${steps}...), sans plafond`);
  }

  const rule = `${parts.join(', ')}.`;
  return tier.is_last_minute_exempt ? `${rule} Ces nuits ne sont jamais remisées.` : rule;
}

export function SeasonForm({ tier, featured = false }: { tier: TierRow; featured?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveTierAction, IDLE);
  const lastNight = addDays(tier.end_date, -1);

  return (
    <form action={action} className={featured ? 'admin-card' : 'admin-card admin-card-compact'}>
      <input type="hidden" name="id" value={tier.id} />

      <div className="admin-season-head">
        <h4 className="admin-card-title">{tier.label}</h4>
        <span className="admin-season-dates">
          du {longDateLabel(tier.start_date)} au {longDateLabel(lastNight)}
        </span>
      </div>

      <div className="admin-field-row">
        <label className="admin-field">
          <span className="admin-label">Nom</span>
          <input type="text" name="label" defaultValue={tier.label} className="admin-input" />
        </label>

        <label className="admin-field">
          <span className="admin-label">Tarif de nuit</span>
          <span className="admin-input-money">
            <input
              type="text"
              inputMode="decimal"
              name="nightly_rate"
              defaultValue={tier.nightly_rate === null ? '' : String(tier.nightly_rate)}
              placeholder="à définir"
              className="admin-input"
            />
            <span aria-hidden="true">€</span>
          </span>
        </label>
      </div>

      <div className="admin-field-row">
        <label className="admin-field">
          <span className="admin-label">Première nuit</span>
          <input
            type="date"
            name="start_date"
            defaultValue={tier.start_date}
            className="admin-input"
          />
        </label>

        <label className="admin-field">
          <span className="admin-label">Dernière nuit</span>
          <input type="date" name="last_night" defaultValue={lastNight} className="admin-input" />
          <span className="admin-help">La nuit du départ n&rsquo;en fait pas partie.</span>
        </label>
      </div>

      <label className="admin-check">
        <input
          type="checkbox"
          name="is_last_minute_exempt"
          defaultChecked={tier.is_last_minute_exempt}
        />
        <span>Exclure cette saison de la remise dernière minute</span>
      </label>

      <p className="admin-rule-summary admin-rule-summary-quiet">{constraintSummary(tier)}</p>

      <details className="admin-details">
        <summary>Modifier les contraintes de séjour</summary>
        <p className="admin-note admin-note-warn">
          Ces trois réglages pilotent le calendrier du visiteur. Les desserrer laisse passer des
          arrivées que le studio ne peut pas prendre.
        </p>

        <div className="admin-field-row">
          <label className="admin-field">
            <span className="admin-label">Jour d&rsquo;arrivée</span>
            <select
              name="checkin_constraint"
              defaultValue={tier.checkin_constraint}
              className="admin-input"
            >
              <option value="any">N&rsquo;importe quel jour</option>
              <option value="saturday">Samedi uniquement</option>
            </select>
          </label>

          <label className="admin-field">
            <span className="admin-label">Minimum de nuits</span>
            <input
              type="number"
              min="1"
              step="1"
              name="min_nights"
              defaultValue={String(tier.min_nights)}
              className="admin-input"
            />
          </label>

          <label className="admin-field">
            <span className="admin-label">Multiple de nuits</span>
            <input
              type="number"
              min="1"
              step="1"
              name="stay_multiple"
              defaultValue={tier.stay_multiple === null ? '' : String(tier.stay_multiple)}
              placeholder="aucun"
              className="admin-input"
            />
            <span className="admin-help">7 pour du samedi au samedi. Vide pour aucune règle.</span>
          </label>
        </div>
      </details>

      <div className="admin-actions">
        <button type="submit" className="admin-btn admin-btn-secondary" disabled={pending}>
          {pending ? 'Enregistrement...' : 'Enregistrer cette saison'}
        </button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
