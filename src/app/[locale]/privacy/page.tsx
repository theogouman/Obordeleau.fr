import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AccentHeading } from '@/components/AccentHeading';
import { Header } from '@/components/Header';
import { Section } from '@/components/Section';
import { localeTags, type Locale } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo';

/** Kept in one place so all three languages show the same date. */
const LAST_UPDATED = '2026-08-20';

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
  const nav = await getTranslations({ locale, namespace: 'nav' });
  const legal = await getTranslations({ locale, namespace: 'legalPage' });

  const formattedDate = new Intl.DateTimeFormat(localeTags[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${LAST_UPDATED}T00:00:00Z`));

  const sections = [
    'principle',
    'inquiry',
    'analytics',
    'map',
    'hosting',
    'reviews',
    'rights',
  ] as const;

  return (
    <>
      <Header
        variant="inner"
        labels={{
          home: nav('home'),
          gallery: nav('gallery'),
          amenities: nav('amenities'),
          around: nav('around'),
          about: nav('about'),
          reviews: nav('reviews'),
          location: nav('location'),
          book: nav('book'),
          openMenu: nav('openMenu'),
          closeMenu: nav('closeMenu'),
          language: nav('language'),
          primary: nav('primary'),
          mobileMenu: nav('mobileMenu'),
        }}
      />

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
                    {t(`sections.${section}.body`, { email: legal('placeholder') })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </main>
    </>
  );
}
