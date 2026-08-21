import type { ReactNode } from 'react';

const COLUMN_COUNT = 3;

export type WallItem = {
  /** Stable across a filter change: the move animation is keyed on it. */
  id: string;
  node: ReactNode;
  leaving?: boolean;
};

type Props = {
  items: WallItem[];
  className?: string;
};

/**
 * The reviews page wall: three columns that are real containers, one under the
 * other, and not one flow cut into columns by the browser.
 *
 * A multi-column box holds a single stream of cards. Opening a review makes it
 * taller, the stream no longer fits where it did, and everything after it
 * spills over the column boundary: cards climb into the next column and push
 * out the ones that were sitting there. Reading one review reshuffles two
 * columns the reader was not looking at. With a container per column, the card
 * that grows lengthens its own column and its neighbours never move.
 *
 * The cards are dealt out in contiguous slices rather than one in three, so a
 * column reads top to bottom in the order they were given in, which is also
 * the order they come back in when the three columns collapse into one.
 */
export function ReviewsWall({ items, className = '' }: Props) {
  const columns: WallItem[][] = [];

  let taken = 0;
  for (let index = 0; index < COLUMN_COUNT; index += 1) {
    // Ceil against what is left, so the remainder is spread over the first
    // columns instead of landing on the last one.
    const size = Math.ceil((items.length - taken) / (COLUMN_COUNT - index));
    columns.push(items.slice(taken, taken + size));
    taken += size;
  }

  return (
    <div className={`reviews-columns ${className}`.trim()} role="list">
      {columns.map((column, index) => (
        <div className="reviews-columns__col" key={`col-${index}`}>
          {column.map((item) => (
            <div
              className="reviews-columns__item"
              role="listitem"
              key={item.id}
              data-review={item.id}
              data-leaving={item.leaving ? 'true' : undefined}
            >
              {item.node}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
