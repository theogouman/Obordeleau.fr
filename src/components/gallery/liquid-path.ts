// Surface liquide inspiree de beui.dev/components/blocks/morphing-tabs (beUI), trace reecrit.

/**
 * The tab rail is not a pill sliding over a bar: the active tab IS the panel
 * surface, and what moves is a bump in that surface.
 *
 * One difference from the reference, and it is the one that lets the rail
 * scroll: the original traces the bump AND the panel's top edge with its two
 * rounded corners in a single path. Scrolling that would carry the panel's
 * corners off screen. Here the panel draws its own white top in CSS and this
 * path stops flat on the base line, overlapping it by OVERLAP so the two whites
 * fuse with no seam. Everything above the base line, bump and liquid joins, is
 * unchanged.
 */

/** Frame inset: the gap between the component edge and the tab strip. */
export const INSET = 16;
/** Height of the rail, base line included. */
export const RAIL_H = 66;
/** Height of the bump above the base line. */
export const TAB_H = 54;
/** Radius of the bump's top corners. */
export const R = 18;
/** Length of the liquid join between the bump and the base line. */
export const JOIN = 26;
/** Radius of the panel's own top corners, drawn in CSS, shared from here. */
export const PR = 22;
/** Gap between two tabs. */
export const GAP = 8;
/** How far the surface reaches below the base line, to fuse with the panel. */
export const OVERLAP = 2;

/** Overdamped: it settles, it never bounces. */
export const SPRING = { stiffness: 700, damping: 50, mass: 0.5 } as const;

/**
 * `left` is the x of the active tab, `W` the width of the traced content (which
 * is wider than the frame once the rail scrolls).
 */
export function surfacePath(left: number, W: number, tabW: number): string {
  const pl = INSET;
  const pr = W - INSET;
  const l = Math.max(pl, Math.min(pr - tabW, left));
  const r = l + tabW;
  const top = RAIL_H - TAB_H;
  const base = RAIL_H;

  // The joins shorten on their own when the bump reaches an edge, so the first
  // and last tabs merge straight into the base line instead of overshooting.
  const lj = Math.max(pl, l - JOIN);
  const rj = Math.min(pr, r + JOIN);
  const ld = Math.min(JOIN, l - lj);
  const rd = Math.min(JOIN, rj - r);
  const lc = ld * 0.55;
  const rc = rd * 0.55;

  return [
    `M${pl} ${base + OVERLAP}`,
    `V${base}`,
    `H${lj}`,
    `C${lj + lc} ${base} ${l} ${base - ld + lc} ${l} ${base - ld}`,
    `V${top + R}`,
    `Q${l} ${top} ${l + R} ${top}`,
    `H${r - R}`,
    `Q${r} ${top} ${r} ${top + R}`,
    `V${base - rd}`,
    `C${r} ${base - rd + rc} ${rj - rc} ${base} ${rj} ${base}`,
    `H${pr}`,
    `V${base + OVERLAP}`,
    'Z',
  ].join(' ');
}

/**
 * Tab width, and with it the whole scroll behaviour, from a single rule.
 *
 * `natural` is the width of the widest tab as the browser actually laid it out.
 * On a wide frame the second term wins: tabs are flush, equal, and fill the
 * frame. Once the frame is too narrow for that, the first term wins: tabs keep
 * a readable width, the content overflows, and the rail scrolls. No breakpoint
 * is hardcoded, so German and Italian move the tipping point by themselves
 * instead of truncating a label.
 */
export function tabWidth(frameWidth: number, count: number, natural: number): number {
  const inner = frameWidth - INSET * 2 - GAP * (count - 1);
  return Math.max(natural, Math.floor(inner / count));
}

/** x of each tab, in the traced coordinate space. */
export function tabSlots(count: number, tabW: number): number[] {
  return Array.from({ length: count }, (_, i) => INSET + i * (tabW + GAP));
}

/** Total width the surface is traced at. */
export function contentWidth(count: number, tabW: number): number {
  return INSET * 2 + count * tabW + GAP * (count - 1);
}
