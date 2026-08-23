// Surface liquide inspiree de beui.dev/components/blocks/morphing-tabs (beUI), trace reecrit.

/**
 * The tab rail is not a pill sliding over a bar: the active tab IS the panel
 * surface, and what moves is a bump in that surface.
 *
 * The path draws the bump, its two liquid joins, and the top edge of the panel
 * with its two rounded corners, in one stroke. The corner radii shrink on their
 * own as the bump reaches an edge, which is what squares off the corner when
 * the first or the last room is the active one.
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
/** Radius of the panel's top corners. */
export const PR = 22;
/** Height the surface is traced at: the rail, plus the panel's corners. */
export const SURFACE_H = RAIL_H + PR;

/** Overdamped: it settles, it never bounces. */
export const SPRING = { k: 700, c: 50, m: 0.5 } as const;
/** Below this, in px and px/s, the spring is called home. */
export const SPRING_EPSILON = 0.25;

/**
 * `left` and `tabW` place the bump, `W` is the width of the frame the surface
 * is traced across.
 */
export function surfacePath(left: number, tabW: number, W: number): string {
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

  // And the panel's own corners shrink with them, so the corner is square when
  // the bump sits right on it.
  const lpr = Math.min(PR, lj - pl);
  const rpr = Math.min(PR, pr - rj);

  return [
    `M${pl} ${base + PR}`,
    `V${base + lpr}`,
    `Q${pl} ${base} ${pl + lpr} ${base}`,
    `H${lj}`,
    `C${lj + lc} ${base} ${l} ${base - ld + lc} ${l} ${base - ld}`,
    `V${top + R}`,
    `Q${l} ${top} ${l + R} ${top}`,
    `H${r - R}`,
    `Q${r} ${top} ${r} ${top + R}`,
    `V${base - rd}`,
    `C${r} ${base - rd + rc} ${rj - rc} ${base} ${rj} ${base}`,
    `H${pr - rpr}`,
    `Q${pr} ${base} ${pr} ${base + rpr}`,
    `V${base + PR}`,
    'Z',
  ].join(' ');
}
