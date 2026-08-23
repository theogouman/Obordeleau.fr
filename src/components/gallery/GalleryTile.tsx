'use client';

import Image from 'next/image';
import { memo, useEffect, useRef, useState } from 'react';
import type { PhotoView } from './types';

/** Mirrors --reveal-dur: the skeleton leaves once the two layers have crossed. */
const REVEAL_MS = 400;

/**
 * The tile is the geometry the viewer grows out of and shrinks back into: the
 * morph reads this image's box and animates the large one from it.
 *
 * Tile and viewer are both 4:3, so the morph is a uniform scale: the cover crop
 * is identical at both ends and the photo never squashes on the way.
 *
 * A photograph never appears raw. The tiles of a room that has not been opened
 * yet hold no image at all, since the browser does not fetch what is hidden, so
 * changing room used to fill the grid with six pictures snapping in one after
 * the other as each request landed. Each tile now stands on a skeleton that
 * breathes while it waits, and the photograph crosses with it: transitions.dev
 * 14, skeleton loader and reveal, whose two layers share the same box so the
 * swap moves nothing.
 *
 * `interactive` is what keeps the page whole without JavaScript. Until the
 * gallery hydrates every tile renders already revealed, which is also what the
 * server sends: a skeleton armed on the server would be a skeleton forever on a
 * page whose script never runs.
 */
export const GalleryTile = memo(function GalleryTile({
  photo,
  openLabel,
  missingLabel,
  interactive,
  onOpen,
}: {
  photo: PhotoView;
  openLabel: string;
  missingLabel: string;
  /** False until hydration: before that the photograph is simply there. */
  interactive: boolean;
  onOpen: (index: number) => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  /*
   * A photograph already in the cache can be complete before React has had the
   * chance to hear its load event, and the tile would then wait for an event
   * that has already happened. Asked once, on mount, and the room that is open
   * on arrival never blinks.
   */
  useEffect(() => {
    if (imageRef.current?.complete) setLoaded(true);
  }, []);

  const revealed = !interactive || loaded;

  /*
   * And once the crossing is over the skeleton goes, rather than breathing for
   * the rest of the visit under a photograph that hides it. Sixteen tiles each
   * running an endless animation cost frames on a telephone, and they were
   * taken from the very movements this component exists to keep smooth.
   */
  const [standing, setStanding] = useState(true);

  useEffect(() => {
    if (!revealed) return;
    const timer = window.setTimeout(() => setStanding(false), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  return (
    <button
      type="button"
      id={`gallery-tile-${photo.id}`}
      className={`gallery-tile t-skel ${revealed ? 'is-revealed' : ''}`}
      disabled={!photo.available}
      aria-label={`${openLabel}: ${photo.alt}`}
      aria-busy={!revealed || undefined}
      onClick={() => onOpen(photo.index)}
    >
      {photo.available ? (
        <>
          {standing ? (
            <span className="t-skel-skeleton is-pulsing" aria-hidden="true">
              <span className="gallery-tile__skeleton" />
            </span>
          ) : null}

          <span className="t-skel-content">
            <Image
              ref={imageRef}
              src={photo.src}
              alt={photo.alt}
              fill
              sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 50vw"
              className="gallery-tile__img"
              onLoad={() => setLoaded(true)}
              /* A request that is lost must not leave a skeleton breathing over
                 an empty square for the rest of the visit. */
              onError={() => setLoaded(true)}
            />
          </span>
        </>
      ) : (
        <span className="gallery-tile__missing">{missingLabel}</span>
      )}
    </button>
  );
});
