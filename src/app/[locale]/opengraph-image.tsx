import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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

/** The arch over a waterline, the site's mark, drawn at the card's scale. */
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64">
<path d="M6 27V14a10 10 0 0 1 20 0v13" fill="none" stroke="#3A2A26" stroke-width="2" stroke-linecap="round"/>
<path d="M2 27c2.6 0 2.6-2 5.2-2s2.6 2 5.2 2 2.6-2 5.2-2 2.6 2 5.2 2 2.6-2 5.2-2 2.6 2 5.2 2" fill="none" stroke="#F25C54" stroke-width="2" stroke-linecap="round"/>
</svg>`;

/**
 * The social card, generated at build so no designer asset is needed.
 *
 * Two columns rather than one page of type: the name, what the place is and
 * where it is, on the cream the site is built on, and the studio itself down
 * the right hand side. A card that is only words says nothing a link preview
 * does not already say; the photograph is the part that makes someone stop.
 *
 * The photograph is the first of the gallery, the same one the hero is built
 * from, read off the disk at build time and inlined: an ImageResponse cannot
 * fetch from the site it is a part of, since that site is not serving yet.
 */
export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const meta = await getTranslations({ locale, namespace: 'meta' });

  const photo = await readFile(
    join(process.cwd(), 'public', 'images', 'gallery', property.hero.image),
  );
  const photoSrc = `data:image/jpeg;base64,${photo.toString('base64')}`;
  const markSrc = `data:image/svg+xml;base64,${Buffer.from(MARK).toString('base64')}`;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', fontFamily: 'sans-serif' }}>
        {/* The words, on the ground of the site: cream, warmed towards the
            photograph rather than flat. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: 690,
            height: '100%',
            padding: '64px 60px',
            backgroundColor: '#FAF7F2',
            backgroundImage:
              'linear-gradient(125deg, #FAF7F2 0%, #F6EFE6 52%, #FDE9D9 88%, #FED9BE 100%)',
          }}
        >
          <img src={markSrc} width={64} height={64} alt="" />

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 96, letterSpacing: -2, lineHeight: 1 }}>
              <span style={{ color: '#3A2A26' }}>Obordel</span>
              <span style={{ color: '#CE4257' }}>eau</span>
            </div>

            <div style={{ display: 'flex', marginTop: 26, fontSize: 40, color: '#6B5750' }}>
              {meta('ogTagline')}
            </div>

            <div style={{ display: 'flex', marginTop: 10, fontSize: 40, color: '#A8253C' }}>
              {property.address.neighbourhood}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', width: 200, height: 10, backgroundColor: '#FF9B54' }} />
            <div style={{ display: 'flex', width: 92, height: 10, backgroundColor: '#F25C54' }} />
            <div style={{ display: 'flex', width: 46, height: 10, backgroundColor: '#CE4257' }} />
          </div>
        </div>

        {/* The studio, filling its half edge to edge. */}
        <div style={{ display: 'flex', width: 510, height: '100%', position: 'relative' }}>
          <img
            src={photoSrc}
            width={510}
            height={630}
            alt=""
            style={{ width: 510, height: 630, objectFit: 'cover' }}
          />
          {/* The seam between the two halves, so the photograph does not simply
              stop against the cream. */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 90,
              height: 630,
              backgroundImage: 'linear-gradient(90deg, rgba(250,247,242,0.55), rgba(250,247,242,0))',
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
