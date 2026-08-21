import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AccentHeading } from '@/components/AccentHeading';
import { Section } from '@/components/Section';
import { localeTags, type Locale } from '@/i18n/routing';
import { host } from '@/lib/content';
import { buildMetadata } from '@/lib/seo';

/** Kept in one place so every language shows the same date. */
const LAST_UPDATED = '2026-08-22';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  return buildMetadata({
    locale,
    pathname: '/privacy',
    title: t('privacy.title'),
    description: t('privacy.description'),
    siteName: t('siteName'),
  });
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'privacyPage' });

  const formattedDate = new Intl.DateTimeFormat(localeTags[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${LAST_UPDATED}T00:00:00Z`));

  const sections = [
    'principle',
    'booking',
    'analytics',
    'map',
    'hosting',
    'reviews',
    'rights',
  ] as const;

  return (
    <main id="main">
      <Section labelledBy="privacy-title">
        <div className="max-w-3xl">
          <AccentHeading
            as="h1"
            id="privacy-title"
            lead={t('titleLead')}
            accent={t('titleAccent')}
            tail={t('titleTail')}
            className="text-4xl md:text-6xl"
          />
          <p className="mt-4 text-sm text-ink-soft">{t('updated', { date: formattedDate })}</p>

          <div className="mt-8 space-y-8">
            {sections.map((section) => (
              <div key={section}>
                <h2 className="font-display text-2xl">{t(`sections.${section}.title`)}</h2>
                <p className="mt-2 text-ink-soft">
                  {/* Where a rights request actually lands. It used to be the
                      legal notice's "to be completed", which told a visitor
                      asking for their data to write to nobody. */}
                  {t(`sections.${section}.body`, { email: host.contact.email })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </main>
  );
}
