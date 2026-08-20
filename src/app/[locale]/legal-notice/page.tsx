import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AccentHeading } from '@/components/AccentHeading';
import { Header } from '@/components/Header';
import { Section } from '@/components/Section';
import type { Locale } from '@/i18n/routing';
import { buildMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  return buildMetadata({
    locale,
    pathname: '/legal-notice',
    title: t('legal.title'),
    description: t('legal.description'),
    siteName: t('siteName'),
    // Not indexed while the identity fields are still placeholders (FR-023).
    noIndex: true,
  });
}

/**
 * FR-023: the page exists and is linked. The legal identity fields are the
 * open [NEEDS CLARIFICATION] item from the spec, so every one of them renders
 * a visible placeholder rather than an invented value.
 */
export default async function LegalNoticePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'legalPage' });
  const nav = await getTranslations({ locale, namespace: 'nav' });
  const placeholder = t('placeholder');

  const values = {
    name: placeholder,
    status: placeholder,
    address: placeholder,
    siret: placeholder,
    email: placeholder,
    declaration: placeholder,
  };

  const empty: Record<string, string> = {};
  const sections: Array<{ id: string; values: Record<string, string> }> = [
    { id: 'publisher', values },
    { id: 'director', values },
    { id: 'hosting', values: empty },
    { id: 'property', values },
    { id: 'intellectual', values: empty },
    { id: 'credits', values: empty },
  ];

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
        <Section labelledBy="legal-title">
          <div className="max-w-3xl">
            <AccentHeading
              as="h1"
              id="legal-title"
              lead={t('titleLead')}
              accent={t('titleAccent')}
              tail={t('titleTail')}
              className="text-4xl md:text-6xl"
            />

            <p className="mt-6 rounded-[var(--radius-card)] border border-dashed border-[rgba(206,66,87,0.5)] bg-[rgba(255,155,84,0.12)] p-4 text-sm">
              {t('pendingNotice')}
            </p>

            <div className="mt-8 space-y-8">
              {sections.map((section) => (
                <div key={section.id}>
                  <h2 className="font-display text-2xl">{t(`sections.${section.id}.title`)}</h2>
                  <p className="mt-2 text-ink-soft">
                    {t(`sections.${section.id}.body`, section.values)}
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
