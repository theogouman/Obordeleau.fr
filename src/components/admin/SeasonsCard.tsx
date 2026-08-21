'use client';

import { SeasonForm } from '@/components/admin/SeasonForm';
import type { TierRow } from '@/lib/admin-data';

/**
 * The seasons, with the one that matters now in front.
 *
 * Seven identical July and August rows are seeded, one per year, and showing
 * them all at once turns a simple page into a spreadsheet. The next season to
 * arrive gets the full card; the rest wait behind a disclosure.
 */
export function SeasonsCard({ tiers, today }: { tiers: TierRow[]; today: string }) {
  if (tiers.length === 0) {
    return (
      <p className="admin-note">
        Aucune saison n&rsquo;est enregistrée. Toutes les nuits suivent le prix par défaut et le
        minimum de nuits hors saison.
      </p>
    );
  }

  const upcoming = tiers.find((tier) => tier.end_date > today) ?? tiers[tiers.length - 1];
  const others = tiers.filter((tier) => tier.id !== upcoming.id);

  return (
    <div className="admin-seasons">
      <SeasonForm tier={upcoming} featured />

      {others.length > 0 ? (
        <details className="admin-details admin-details-block">
          <summary>
            Les {others.length} autres saisons ({others[0].label} à {others[others.length - 1].label}
            )
          </summary>
          <div className="admin-seasons-list">
            {others.map((tier) => (
              <SeasonForm key={tier.id} tier={tier} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
