import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { routing, type Locale } from '@/i18n/routing';
import { property } from '@/lib/content';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Obordeleau';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** Branded social card, generated at build so no designer asset is needed. */
export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const hero = await getTranslations({ locale, namespace: 'hero' });

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#FAF7F2',
          padding: '72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#6B5750', fontSize: 30 }}>
          {hero('eyebrow')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', color: '#3A2A26', fontSize: 78, lineHeight: 1.05 }}>
            {`${hero('titleLead')} ${hero('titleAccent')} ${hero('titleTail')}`.trim()}
          </div>
          <div style={{ display: 'flex', color: '#A8253C', fontSize: 34 }}>
            {property.name} , {property.address.locality}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', width: 260, height: 10, backgroundColor: '#FF9B54' }} />
          <div style={{ display: 'flex', width: 120, height: 10, backgroundColor: '#F25C54' }} />
          <div style={{ display: 'flex', width: 60, height: 10, backgroundColor: '#CE4257' }} />
        </div>
      </div>
    ),
    size,
  );
}
