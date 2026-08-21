/**
 * Euros, written the French way, without Intl.
 *
 * Intl.NumberFormat resolves against the runtime's own ICU data, and Node and
 * a browser do not always pick the same space before the currency sign. In a
 * component that renders on the server and hydrates in the browser that is a
 * hydration mismatch, so the formatting is done by hand and is identical on
 * both sides.
 */
export function euros(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace('.', ',');
  return `${text} €`;
}

/** The same figure with no unit, for a tight calendar cell. */
export function bareAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace('.', ',');
}
