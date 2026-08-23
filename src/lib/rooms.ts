/**
 * The five rooms, on their own and with no JSON behind them.
 *
 * The client components need this order, and importing it from `content.ts`
 * would drag the property, host and legal files into the browser bundle for
 * five strings.
 */
export type RoomId = 'living' | 'kitchen' | 'bed' | 'bath' | 'overview';

/** Tab order, and the order the lightbox walks the whole studio in. */
export const ROOM_ORDER: RoomId[] = ['living', 'kitchen', 'bed', 'bath', 'overview'];
