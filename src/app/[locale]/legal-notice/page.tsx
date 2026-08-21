import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AccentHeading } from '@/components/AccentHeading';
import { Section } from '@/components/Section';
import type { Locale } from '@/i18n/routing';
import { legal, property } from '@/lib/content';
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
    // A legal notice has to be reachable, not ranked. It is linked from every
    // page and left out of the index on purpose.
    noIndex: true,
  });
}

/**
 * FR-023: who lets the flat, who runs the site, and where both can be reached.
 *
 * The two identities are separate people and are named as such: the flat is
 * Corine's, the site is mine. Neither name, address nor number is written into
 * a message file, because none of them is translated and four copies of an
 * address is four chances to update three of them.
 */
export default async function LegalNoticePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'legalPage' });

  const propertyAddress = `${property.address.street}, ${property.address.postalCode} ${property.address.locality}`;

  return (
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

          <div className="mt-8 space-y-8">
            <div>
              <h2 className="font-display text-2xl">{t('sections.owner.title')}</h2>
              <Identity
                name={legal.owner.name}
                street={legal.owner.street}
                postalCode={legal.owner.postalCode}
                locality={legal.owner.locality}
                email={legal.owner.email}
                phone={legal.owner.phone}
              />
            </div>

            <div>
              <h2 className="font-display text-2xl">{t('sections.publisher.title')}</h2>
              {/* The sentence names him, so the block underneath is only the
                  two ways of reaching him. */}
              <p className="mt-2 text-ink-soft">
                {t('sections.publisher.body', { name: legal.publisher.name })}
              </p>
              <Identity email={legal.publisher.email} phone={legal.publisher.phone} />
            </div>

            <div>
              <h2 className="font-display text-2xl">{t('sections.hosting.title')}</h2>
              <p className="mt-2 text-ink-soft">{t('sections.hosting.body')}</p>
            </div>

            <div>
              <h2 className="font-display text-2xl">{t('sections.property.title')}</h2>
              <p className="mt-2 text-ink-soft">
                {t('sections.property.body', { address: propertyAddress })}
              </p>
            </div>

            <div>
              <h2 className="font-display text-2xl">{t('sections.credits.title')}</h2>
              <p className="mt-2 text-ink-soft">{t('sections.credits.body')}</p>
            </div>
          </div>
        </div>
      </Section>
    </main>
  );
}

/**
 * A name, where to write and where to call. The two ways of reaching someone
 * are links rather than text: on a phone, a legal notice that cannot be dialled
 * from is a legal notice nobody uses.
 */
function Identity({
  name,
  street,
  postalCode,
  locality,
  email,
  phone,
}: {
  name?: string;
  street?: string;
  postalCode?: string;
  locality?: string;
  email: string;
  phone: string;
}) {
  return (
    <address className="mt-2 not-italic leading-relaxed text-ink-soft">
      {name ? (
        <>
          <span className="font-medium text-ink">{name}</span>
          <br />
        </>
      ) : null}
      {street ? (
        <>
          {street}, {postalCode} {locality}
          <br />
        </>
      ) : null}
      <a
        href={`mailto:${email}`}
        className="text-raspberry-ink underline underline-offset-4"
      >
        {email}
      </a>
      <span aria-hidden="true"> · </span>
      <a
        href={`tel:${phone.replace(/\s/g, '')}`}
        className="text-raspberry-ink underline underline-offset-4"
      >
        {phone}
      </a>
    </address>
  );
}
