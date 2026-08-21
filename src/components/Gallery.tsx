import { useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { GalleryGrid, type GalleryItemView } from '@/components/GalleryGrid';
import { Reveal } from '@/components/Reveal';
import { Section } from '@/components/Section';
import { gallery } from '@/lib/content';
import { assetExists } from '@/lib/assets';

export function Gallery() {
  const t = useTranslations('gallery');
  const common = useTranslations('common');
  const root = useTranslations();

  const items: GalleryItemView[] = gallery.map((item) => {
    const src = `/images/gallery/${item.file}`;
    return {
      src,
      alt: root(item.altKey),
      available: assetExists(src),
    };
  });

  return (
    <Section id="gallery" labelledBy="gallery-title">
      <Reveal className="max-w-2xl">
        <AccentHeading
          id="gallery-title"
          lead={t('titleLead')}
          accent={t('titleAccent')}
          tail={t('titleTail')}
        />
        <p className="lead mt-4 text-lg text-ink-soft">{t('intro')}</p>
      </Reveal>

      <div className="mt-10">
        <GalleryGrid
          items={items}
          labels={{
            open: t('open'),
            close: common('close'),
            previous: common('previous'),
            next: common('next'),
            counter: t('counter'),
            missing: t('missing'),
          }}
        />
      </div>
    </Section>
  );
}
