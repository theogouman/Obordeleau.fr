'use client';

import { useActionState } from 'react';
import { saveConfigAction } from '@/app/admin/actions';
import { FormFeedback } from '@/components/admin/FormFeedback';
import type { PricingConfigRow } from '@/lib/admin-data';
import { IDLE, type ActionState } from '@/lib/admin-forms';

/** Empty rather than 0: a rate nobody has set is not a rate of nothing. */
function value(input: number | null | undefined): string {
  return input === null || input === undefined ? '' : String(input);
}

export function ConfigCard({ config }: { config: PricingConfigRow | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveConfigAction, IDLE);
  const baseMissing = config?.base_nightly_rate === null || config?.base_nightly_rate === undefined;

  return (
    <form action={action} className="admin-card">
      <h3 className="admin-card-title">Prix et frais</h3>

      {baseMissing ? (
        <p className="admin-note admin-note-warn">
          Le prix de nuit par défaut n&rsquo;est pas encore réglé. Tant qu&rsquo;il est vide, aucun
          devis ne peut être calculé et le calendrier affiche un point d&rsquo;interrogation.
        </p>
      ) : null}

      <label className="admin-field">
        <span className="admin-label">Prix de nuit par défaut</span>
        <span className="admin-input-money">
          <input
            type="text"
            inputMode="decimal"
            name="base_nightly_rate"
            defaultValue={value(config?.base_nightly_rate)}
            placeholder="à définir"
            className="admin-input"
          />
          <span aria-hidden="true">€</span>
        </span>
        <span className="admin-help">
          Le tarif de toute nuit hors saison, sans prix manuel et hors remise.
        </span>
      </label>

      <label className="admin-field">
        <span className="admin-label">Frais de ménage</span>
        <span className="admin-input-money">
          <input
            type="text"
            inputMode="decimal"
            name="cleaning_fee"
            defaultValue={value(config?.cleaning_fee ?? 0)}
            className="admin-input"
          />
          <span aria-hidden="true">€</span>
        </span>
        <span className="admin-help">Une fois par séjour. 0 veut dire offert.</span>
      </label>

      <label className="admin-field">
        <span className="admin-label">Taxe de séjour, par adulte et par nuit</span>
        <span className="admin-input-money">
          <input
            type="text"
            inputMode="decimal"
            name="tourist_tax_per_adult_night"
            defaultValue={value(config?.tourist_tax_per_adult_night ?? 1.86)}
            className="admin-input"
          />
          <span aria-hidden="true">€</span>
        </span>
        <span className="admin-help">
          Montant tout compris pour un meublé classé 3 étoiles. Les moins de 18 ans en sont
          exonérés. Réindexé chaque janvier, à vérifier sur tpm.taxesejour.fr.
        </span>
      </label>

      <div className="admin-field-row">
        <label className="admin-field">
          <span className="admin-label">Acompte</span>
          <span className="admin-input-money">
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              name="deposit_percentage"
              defaultValue={value(config?.deposit_percentage ?? 50)}
              className="admin-input"
            />
            <span aria-hidden="true">%</span>
          </span>
          <span className="admin-help">
            Part de l&rsquo;hébergement seul débitée à la réservation. Le ménage et la taxe de
            séjour partent avec le solde.
          </span>
        </label>

        <label className="admin-field">
          <span className="admin-label">Débit du solde</span>
          <span className="admin-input-money">
            <input
              type="number"
              min="0"
              step="1"
              name="deposit_charge_days_before_arrival"
              defaultValue={value(config?.deposit_charge_days_before_arrival)}
              placeholder="à définir"
              className="admin-input"
            />
            <span aria-hidden="true">jours avant</span>
          </span>
          <span className="admin-help">
            Combien de jours avant l&rsquo;arrivée le solde est prélevé. Servira au paiement, pas
            encore branché.
          </span>
        </label>
      </div>

      <label className="admin-field">
        <span className="admin-label">Minimum de nuits hors saison</span>
        <input
          type="number"
          min="1"
          step="1"
          name="default_min_nights"
          defaultValue={value(config?.default_min_nights ?? 2)}
          className="admin-input admin-input-narrow"
        />
        <span className="admin-help">
          Chaque saison porte son propre minimum, qui prime sur celui-ci sur ses dates.
        </span>
      </label>

      <div className="admin-actions">
        <button type="submit" className="admin-btn admin-btn-primary" disabled={pending}>
          {pending ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        <FormFeedback state={state} />
      </div>
    </form>
  );
}
