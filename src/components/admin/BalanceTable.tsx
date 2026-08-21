'use client';

import { useActionState } from 'react';
import { runBalancesAction } from '@/app/admin/actions';
import { FormFeedback } from '@/components/admin/FormFeedback';
import { IDLE, type ActionState } from '@/lib/admin-forms';
import type { AdminBalance } from '@/lib/balances';

/**
 * The soldes, and what has been tried on each.
 *
 * The deposit is taken while the visitor is watching; the balance is taken
 * weeks later with nobody there. This is the only place that shows whether it
 * actually happened, which is why the order is by what needs a person rather
 * than by date: a refused card first, then a guest who has been asked and has
 * not answered, then the ones merely waiting for their day.
 *
 * Nothing here computes an amount. Each figure is the balance frozen when the
 * deposit cleared, read back exactly as it will be charged.
 */

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  paid: 'Réglé',
  action_required: 'Le voyageur doit agir',
  failed: 'Échec',
};

function euros(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace('.', ',');
  return `${text} €`;
}

function day(isoDate: string | null): string {
  // Words, not a dash: the copy lint forbids one, and "non défini" says more
  // than a rule would anyway.
  if (!isoDate) return 'non défini';
  const date = isoDate.slice(0, 10);
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
}

export function BalanceTable({ balances }: { balances: AdminBalance[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(runBalancesAction, IDLE);

  const waiting = balances.filter((balance) => balance.status !== 'paid').length;

  return (
    <section className="admin-section" aria-labelledby="admin-balances-title">
      <h2 className="admin-section-title" id="admin-balances-title">
        Soldes
      </h2>
      <p className="admin-section-lead">
        Le solde part tout seul à la date prévue, sur la carte enregistrée. Quand la banque
        demande le voyageur, ou quand la carte refuse, un lien de paiement lui est envoyé et la
        ligne passe en rouge ici.
      </p>

      {balances.length === 0 ? (
        <p className="admin-note">
          Aucun solde pour le moment. Une ligne apparaît ici dès qu&rsquo;un acompte est réglé.
        </p>
      ) : (
        <div className="admin-table-scroll">
          <table className="admin-table">
            <caption className="admin-table-caption">
              {waiting === 0
                ? 'Tous les soldes sont réglés.'
                : `${waiting} solde(s) en cours sur ${balances.length}.`}
            </caption>
            <thead>
              <tr>
                <th scope="col">Séjour</th>
                <th scope="col">Voyageur</th>
                <th scope="col">Montant</th>
                <th scope="col">Débit prévu</th>
                <th scope="col">État</th>
                <th scope="col">Tentatives</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((balance) => (
                <tr key={balance.reservationId} data-balance={balance.status}>
                  <td>
                    {day(balance.startDate)} au {day(balance.endDate)}
                    {balance.reservationStatus !== 'confirmed' ? (
                      <span className="admin-table-note">réservation annulée</span>
                    ) : null}
                  </td>
                  <td>
                    {balance.guestName}
                    <span className="admin-table-note">{balance.guestEmail}</span>
                  </td>
                  <td className="admin-table-amount">{euros(balance.amount)}</td>
                  <td>{day(balance.chargeOn)}</td>
                  <td>
                    <span className="admin-badge" data-balance={balance.status}>
                      {STATUS_LABELS[balance.status] ?? balance.status}
                    </span>
                    {balance.lastError ? (
                      <span className="admin-table-note">{balance.lastError}</span>
                    ) : null}
                    {!balance.consent && balance.status !== 'paid' ? (
                      <span className="admin-table-note">
                        pas d&rsquo;autorisation de prélèvement
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {balance.attempts} essai(s), {balance.reminders} relance(s)
                    {balance.nextAttemptAt && balance.status !== 'paid' ? (
                      <span className="admin-table-note">
                        prochaine le {day(balance.nextAttemptAt)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={action} className="admin-actions">
        <button type="submit" className="admin-btn admin-btn-secondary" disabled={pending}>
          {pending ? 'Passage en cours...' : 'Lancer le passage maintenant'}
        </button>
        <FormFeedback state={state} />
      </form>

      <p className="admin-help">
        Le passage se fait tout seul chaque matin. Ce bouton fait le même travail tout de suite, et
        ne peut pas débiter deux fois : chaque solde est réservé avant d&rsquo;être débité.
      </p>
    </section>
  );
}
