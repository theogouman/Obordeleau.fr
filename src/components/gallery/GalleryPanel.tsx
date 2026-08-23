'use client';

import { memo, type CSSProperties } from 'react';
import type { RoomId } from '@/lib/rooms';
import { chunkIntoRows } from './gallery-layout';
import { GalleryTile } from './GalleryTile';
import type { GalleryLabels, PhotoView } from './types';

/**
 * One room: its heading on one line, and its photos cut into rows of 2 or 3.
 *
 * Rendered for every room on the server, so the page without JavaScript is a
 * plain gallery in five labelled sections rather than an empty frame.
 */
export const GalleryPanel = memo(function GalleryPanel({
  room,
  photos,
  labels,
  active,
  interactive,
  onOpen,
}: {
  room: RoomId;
  photos: PhotoView[];
  labels: GalleryLabels;
  active: boolean;
  /** False until hydration: before that every panel is shown, and none is a tabpanel. */
  interactive: boolean;
  onOpen: (index: number) => void;
}) {
  const rows = chunkIntoRows(photos);

  return (
    <section
      id={`gallery-${room}`}
      className="gallery-panel"
      hidden={interactive && !active}
      data-active={interactive && active ? 'true' : undefined}
      role={interactive ? 'tabpanel' : undefined}
      aria-labelledby={interactive ? `gallery-tab-${room}` : undefined}
      tabIndex={interactive ? -1 : undefined}
    >
      <div className="gallery-panel__head">
        <h3 className="gallery-panel__title">{labels.rooms[room]}</h3>
        <p className="gallery-panel__sub">
          {labels.roomSub[room]} &middot; {labels.roomCount[room]}
        </p>
      </div>

      <div className="gallery-rows">
        {rows.map((row) => (
          <div
            key={row.map((photo) => photo.id).join('-')}
            className="gallery-row"
            style={{ '--row-cols': row.length } as CSSProperties}
          >
            {row.map((photo) => (
              <GalleryTile
                key={photo.id}
                photo={photo}
                openLabel={labels.open}
                missingLabel={labels.missing}
                onOpen={onOpen}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
});
