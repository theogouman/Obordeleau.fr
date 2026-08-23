/**
 * Rows of 2 or 3, never a row holding a single photo, and the large images
 * (rows of 2) come first.
 *
 * A lone photo on its last row reads as a mistake rather than as a rhythm,
 * which is why the remainder is spent on a row of 2 instead of being left to
 * dangle.
 */
export function rowsFor(n: number): number[] {
  if (n <= 1) return n ? [1] : [];
  if (n === 2) return [2];
  if (n === 3) return [3];
  if (n === 4) return [2, 2];
  if (n === 5) return [2, 3];

  const rows: number[] = [];
  let m = n;
  while (m > 0) {
    if (m % 3 === 0) {
      rows.push(3);
      m -= 3;
    } else if (m % 3 === 2) {
      rows.push(2);
      m -= 2;
    } else if (m >= 4) {
      rows.push(2);
      m -= 2;
    } else {
      rows.push(1);
      m -= 1;
    }
  }
  return rows;
}

/** Cuts a room's photos into the rows `rowsFor` asked for. */
export function chunkIntoRows<T>(items: T[], rows: number[] = rowsFor(items.length)): T[][] {
  const out: T[][] = [];
  let index = 0;
  for (const size of rows) {
    out.push(items.slice(index, index + size));
    index += size;
  }
  return out;
}
