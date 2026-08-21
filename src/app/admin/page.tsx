import { signOutAction } from '@/app/admin/actions';
import { GeneralRules } from '@/components/admin/GeneralRules';
import { PriceCalendar } from '@/components/admin/PriceCalendar';
import { requireAdmin } from '@/lib/admin-auth';
import { adminCalendar, adminSettings } from '@/lib/admin-data';
import { addMonths, parseMonth, startOfMonth } from '@/lib/calendar';
import { bookingStoreConfigured } from '@/lib/supabase';

/**
 * The console, in two halves.
 *
 * The general rules above are set once and touched rarely. The calendar below
 * is where the work happens, and it is the guard rail: because the deposit is
 * charged automatically, the only way to notice that the last minute rule has
 * become a bad idea is to see, at a glance, what it is doing to next week.
 *
 * Everything is rendered on the server against the lot 1 engine, so no price
 * shown here was computed by a browser, and the month is a URL parameter rather
 * than client state: paging is an ordinary navigation, and a month can be
 * bookmarked or reloaded.
 */

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPage({ searchParams }: Props) {
  const session = await requireAdmin();
  const params = await searchParams;
  const requestedMonth = typeof params.m === 'string' ? params.m : undefined;

  if (!bookingStoreConfigured) {
    return (
      <main className="admin-page">
        <p className="admin-note admin-note-warn">
          La base n&rsquo;est pas jointe sur ce déploiement : il manque <code>SUPABASE_URL</code> ou{' '}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>. Rien ne peut être lu ni enregistré tant que ces
          deux variables ne sont pas posées.
        </p>
      </main>
    );
  }

  const settings = await adminSettings();
  const monthStart = parseMonth(requestedMonth) ?? startOfMonth(settings.today);
  const monthEnd = addMonths(monthStart, 1);
  const nights = await adminCalendar(monthStart, monthEnd);

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">Obordeleau</p>
          <h1 className="admin-title">Prix et calendrier</h1>
        </div>
        <form action={signOutAction} className="admin-header-session">
          <span className="admin-header-email">{session.email}</span>
          <button type="submit" className="admin-btn admin-btn-quiet">
            Se déconnecter
          </button>
        </form>
      </header>

      <GeneralRules settings={settings} />

      <PriceCalendar
        monthStart={monthStart}
        today={settings.today}
        nights={nights}
        hasUnpricedNights={nights.some((night) => night.price === null)}
      />
    </main>
  );
}
