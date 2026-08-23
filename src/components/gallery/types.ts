import type { RoomId } from '@/lib/rooms';

/** One photo, resolved on the server: alt translated, presence checked at build. */
export type PhotoView = {
  /** `gallery-07`, and with it the shared layout id of the morph. */
  id: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  available: boolean;
  room: RoomId;
  /** Position in the flat run of the whole studio, room after room. */
  index: number;
};

export type GalleryLabels = {
  open: string;
  close: string;
  previous: string;
  next: string;
  counter: string;
  roomCounter: string;
  missing: string;
  rooms: Record<RoomId, string>;
  roomSub: Record<RoomId, string>;
};

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.replace(`{${key}}`, String(value)),
    template,
  );
}
