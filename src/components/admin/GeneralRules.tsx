import { ConfigCard } from '@/components/admin/ConfigCard';
import { LastMinuteCard } from '@/components/admin/LastMinuteCard';
import { SeasonsCard } from '@/components/admin/SeasonsCard';
import type { AdminSettings } from '@/lib/admin-data';

/**
 * The settings half of the console: set once, revisited rarely. Rendered on the
 * server and handed down, so the page holds no second copy of the state.
 */
export function GeneralRules({ settings }: { settings: AdminSettings }) {
  return (
    <section className="admin-section" aria-labelledby="admin-rules-title">
      <h2 className="admin-section-title" id="admin-rules-title">
        Règles générales
      </h2>
      <p className="admin-section-lead">
        Ce que le moteur applique par défaut. Les prix posés à la main dans le calendrier passent
        toujours devant.
      </p>

      <div className="admin-columns">
        <ConfigCard config={settings.config} />
        <LastMinuteCard lastMinute={settings.lastMinute} tiers={settings.tiers} />
      </div>

      <h3 className="admin-subsection-title">Saisons</h3>
      <SeasonsCard tiers={settings.tiers} today={settings.today} />
    </section>
  );
}
