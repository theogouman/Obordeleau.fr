import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Section } from '@/components/Section';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo';

/**
 * Where a guest lands after following the balance link in their email.
 *
 * Three states, and all three are readable with no JavaScript at all: the page
 * is a sentence and a way back. It carries noindex because it is one guest's
 * business and never a landing page, and it is out of the sitemap for the same
 * reason.
 *
 * The status comes back on the URL from Stripe, in English, because it is a
 * machine handing over to a machine. What the reader sees is their language.
 */

export const dynamic = 'force-dynamic';

type Status = 'paid' | 'cancelled' | 'unavailable';

const STATUSES: readonly Status[] = ['paid', 'cancelled', 'unavailable'];

function asStatus(value: unknown): Status {
  return (STATUSES as readonly string[]).includes(String(value))
    ? (value as Status)
    : 'unavailable';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'balancePage' });
  const meta = await getTranslations({ locale, namespace: 'meta' });

  return buildMetadata({
    locale,
    pathname: '/balance',
    title: t('metaTitle'),
    description: t('metaDescription'),
    siteName: meta('siteName'),
    noIndex: true,
  });
}

export default async function BalancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const query = await searchParams;
  const status = asStatus(query.status);
  const t = await getTranslations({ locale, namespace: 'balancePage' });

  return (
    <main id="main">
      <Section labelledBy="balance-title">
        <div className="max-w-2xl">
          <h1 id="balance-title" className="font-display text-4xl md:text-5xl">
            {t(`${status}.title`)}
          </h1>

          <p className="mt-4 text-lg text-ink-soft">{t(`${status}.body`)}</p>

          <Link href="/" className="btn btn-primary mt-8 inline-flex">
            {t('home')}
          </Link>
        </div>
      </Section>
    </main>
  );
}
