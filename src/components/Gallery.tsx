import { useTranslations } from 'next-intl';
import { AccentHeading } from '@/components/AccentHeading';
import { GalleryTabs } from '@/components/gallery/GalleryTabs';
import type { GalleryLabels, PhotoView } from '@/components/gallery/types';
import { Reveal } from '@/components/Reveal';
import { Section } from '@/components/Section';
import { gallerySequence, ROOM_ORDER, type RoomId } from '@/lib/content';
import { assetExists } from '@/lib/assets';

/**
 * FR-003: the photos, their alt text and their room all resolve on the server.
 * The tab presentation is an enhancement laid over markup that already holds
 * every photo, so the gallery is complete with JavaScript off.
 */
export function Gallery() {
  const t = useTranslations('gallery');
  const common = useTranslations('common');
  const root = useTranslations();

  const photos: PhotoView[] = gallerySequence.map((item, index) => {
    const src = `/images/gallery/${item.file}`;
    return {
      id: item.file.replace(/\.[a-z]+$/i, ''),
      src,
      alt: root(item.altKey),
      width: item.width,
      height: item.height,
      available: assetExists(src),
      room: item.room,
      index,
    };
  });

  const byRoom = <T,>(read: (room: RoomId) => T) =>
    Object.fromEntries(ROOM_ORDER.map((room) => [room, read(room)])) as Record<RoomId, T>;

  const labels: GalleryLabels = {
    open: t('open'),
    close: common('close'),
    previous: common('previous'),
    next: common('next'),
    // Raw: these two are filled in the browser, photo after photo, so they
    // have to cross as templates rather than be formatted here and now.
    counter: t.raw('counter'),
    roomCounter: t.raw('lightbox.roomCounter'),
    missing: t('missing'),
    rooms: byRoom((room) => t(`rooms.${room}`)),
    roomSub: byRoom((room) => t(`roomSub.${room}`)),
    roomCount: byRoom((room) =>
      t('photoCount', { count: photos.filter((photo) => photo.room === room).length }),
    ),
  };

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

      <div className="mt-8">
        <GalleryTabs photos={photos} labels={labels} />
      </div>
    </Section>
  );
}
