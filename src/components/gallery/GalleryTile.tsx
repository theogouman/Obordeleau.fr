'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import type { PhotoView } from './types';

/**
 * The tile carries the shared layout id, so it is the geometry the lightbox
 * grows out of and shrinks back into.
 *
 * Tile and lightbox are both 4:3, so the morph is a uniform scale: the cover
 * crop is identical at both ends and the photo never squashes on the way.
 */
export function GalleryTile({
  photo,
  openLabel,
  missingLabel,
  onOpen,
}: {
  photo: PhotoView;
  openLabel: string;
  missingLabel: string;
  onOpen: (index: number) => void;
}) {
  return (
    <button
      type="button"
      id={`gallery-tile-${photo.id}`}
      className="gallery-tile"
      disabled={!photo.available}
      aria-label={`${openLabel}: ${photo.alt}`}
      onClick={() => onOpen(photo.index)}
    >
      <motion.span layoutId={`photo-${photo.id}`} className="gallery-tile__frame">
        {photo.available ? (
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 50vw"
            className="gallery-tile__img"
          />
        ) : (
          <span className="gallery-tile__missing">{missingLabel}</span>
        )}
      </motion.span>
    </button>
  );
}
