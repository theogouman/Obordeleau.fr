import { useLocale, useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { MapEmbed } from '@/components/MapEmbed';
import { Reveal } from '@/components/Reveal';
import { Section } from '@/components/Section';
import { getPathname } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { externalMapUrl, mapsApiKey, mapsMapId, property } from '@/lib/content';

export function MapSection() {
  const t = useTranslations('map');
  const common = useTranslations('common');
  const locale = useLocale() as Locale;

  return (
    <Section id="location" labelledBy="location-title">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal>
          <AccentHeading
            id="location-title"
            lead={t('titleLead')}
            accent={t('titleAccent')}
            tail={t('titleTail')}
          />
          <p className="mt-4 text-lg text-ink-soft">{t('intro')}</p>

          <h3 className="mt-6 text-sm uppercase tracking-[0.2em] text-ink-soft">
            {t('addressLabel')}
          </h3>
          <address className="mt-2 not-italic">
            {property.address.street}
            <br />
            {property.address.postalCode} {property.address.locality}
          </address>
        </Reveal>

        <Reveal delay={80}>
          <MapEmbed
            apiKey={mapsApiKey}
            mapId={mapsMapId}
            latitude={property.geo.latitude}
            longitude={property.geo.longitude}
            locale={locale}
            externalUrl={externalMapUrl}
            privacyHref={getPathname({ href: '/privacy', locale })}
            labels={{
              openExternal: t('openExternal'),
              openExternalHint: t('openExternalHint'),
              unavailable: t('unavailable'),
              loadError: t('loadError'),
              markerAlt: t('markerAlt'),
              loading: common('loading'),
              thirdPartyNotice: t('thirdPartyNotice'),
              privacyLink: t('privacyLinkLabel'),
            }}
          />
        </Reveal>
      </div>
    </Section>
  );
}
