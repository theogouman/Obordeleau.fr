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
 * The cards are dealt out one in three and not in contiguous slices, because
 * the order they are given in is chronological and has to read across the
 * wall, not down it. A slice per column put every 2026 review in the first
 * column and every 2023 one in the last, which reads as three separate walls
 * that happen to sit side by side.
 *
 * Dealing across costs the single column view its order, since the columns are
 * then read one after the other: card 1, 4, 7 and only later card 2. Each card
 * therefore carries its rank as a flex order. Inside a column the ranks climb
 * anyway, so the property changes nothing there; when the columns are dropped
 * and every card becomes a child of the wall itself, it puts them back in the
 * order they were given in.
 */
export function ReviewsWall({ items, className = '' }: Props) {
  const columns: Array<Array<{ item: WallItem; rank: number }>> = Array.from(
    { length: COLUMN_COUNT },
    () => [],
  );

  items.forEach((item, rank) => {
    columns[rank % COLUMN_COUNT].push({ item, rank });
  });

  return (
    <div className={`reviews-columns ${className}`.trim()} role="list">
      {columns.map((column, index) => (
        <div className="reviews-columns__col" key={`col-${index}`}>
          {column.map(({ item, rank }) => (
            <div
              className="reviews-columns__item"
              role="listitem"
              key={item.id}
              data-review={item.id}
              data-leaving={item.leaving ? 'true' : undefined}
              style={{ order: rank }}
            >
              {item.node}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
