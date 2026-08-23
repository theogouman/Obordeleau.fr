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

/** Mirrors `--resize-dur`, so the JavaScript releases the height once the CSS is done. */
export const RESIZE_MS = 300;

/** Overdamped: it settles, it never bounces. */
export const SPRING = { k: 700, c: 50, m: 0.5 } as const;
/** Below this, in px and px/s, the spring is called home. */
export const SPRING_EPSILON = 0.25;

/**
 * The spring is integrated in steps of this length, in milliseconds, however
 * long the frames turn out to be.
 *
 * A quarter of a sixtieth of a second. Small enough that explicit integration
 * of a stiff spring stays accurate, large enough that the worst case, a stall
 * caught up to the cap below, is a couple of dozen multiplications.
 */
export const SPRING_STEP_MS = 1000 / 240;

/**
 * The most time a single frame may be asked to catch up on.
 *
 * A tab left in the background, or a garbage collection at the wrong moment,
 * hands the next frame a gap of hundreds of milliseconds. Integrating all of
 * it would land the bump on its mark in one jump; four frames' worth is enough
 * to absorb a hiccup and short enough that a real stall simply resumes.
 */
export const SPRING_CATCHUP_MS = 64;

/**
 * A tenth of a pixel, which is finer than any screen and far shorter to write.
 *
 * The path is rewritten on every frame of the glide and the browser parses it
 * again each time, so the difference between `2.7755575615628914e-17` and `0`
 * is paid sixty times a second. Rounding also makes the last frames of the
 * glide repeat, which lets the caller skip the write altogether.
 */
function r(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * `left` and `tabW` place the bump, `W` is the width of the frame the surface
 * is traced across.
 */
export function surfacePath(left: number, tabW: number, W: number): string {
  const pl = INSET;
  const pr = W - INSET;
  const l = Math.max(pl, Math.min(pr - tabW, left));
  const right = l + tabW;
  const top = RAIL_H - TAB_H;
  const base = RAIL_H;

  // The joins shorten on their own when the bump reaches an edge, so the first
  // and last tabs merge straight into the base line instead of overshooting.
  const lj = Math.max(pl, l - JOIN);
  const rj = Math.min(pr, right + JOIN);
  const ld = Math.min(JOIN, l - lj);
  const rd = Math.min(JOIN, rj - right);
  const lc = ld * 0.55;
  const rc = rd * 0.55;

  // And the panel's own corners shrink with them, so the corner is square when
  // the bump sits right on it.
  const lpr = Math.min(PR, lj - pl);
  const rpr = Math.min(PR, pr - rj);

  // One template literal rather than an array of fifteen strings joined: same
  // trace, one allocation instead of sixteen, on every frame of every glide.
  return (
    `M${r(pl)} ${r(base + PR)}` +
    ` V${r(base + lpr)}` +
    ` Q${r(pl)} ${r(base)} ${r(pl + lpr)} ${r(base)}` +
    ` H${r(lj)}` +
    ` C${r(lj + lc)} ${r(base)} ${r(l)} ${r(base - ld + lc)} ${r(l)} ${r(base - ld)}` +
    ` V${r(top + R)}` +
    ` Q${r(l)} ${r(top)} ${r(l + R)} ${r(top)}` +
    ` H${r(right - R)}` +
    ` Q${r(right)} ${r(top)} ${r(right)} ${r(top + R)}` +
    ` V${r(base - rd)}` +
    ` C${r(right)} ${r(base - rd + rc)} ${r(rj - rc)} ${r(base)} ${r(rj)} ${r(base)}` +
    ` H${r(pr - rpr)}` +
    ` Q${r(pr)} ${r(base)} ${r(pr)} ${r(base + rpr)}` +
    ` V${r(base + PR)}` +
    ' Z'
  );
}
