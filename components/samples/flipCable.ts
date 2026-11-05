/**
 * Geometry for the cable that joins a sample pair's two covers.
 *
 * Kept pure (boxes in, path data out) so it can be tested without a layout
 * engine, and so the cable is ordinary React-rendered SVG: it is on screen,
 * fully drawn, whether or not GSAP ever loads. The animation only replays how
 * it got there.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Breathing room between the cable's ends and the covers it plugs into. */
const INSET = 4;
/** Below this there is no room to draw anything that reads as a connection. */
const MIN_GAP = 12;
/** Sideways sway, in px. Enough to read as a lead rather than a rule; never
 *  enough to reach the label that starts at the title column. */
const MAX_BEND = 7;

const r = (n: number) => Math.round(n * 10) / 10;

/**
 * Path from the source record's cover UP to the flip's cover — the direction
 * the sound travelled. A gentle S, so the travelling signal visibly follows a
 * path instead of sliding down a ruler line.
 *
 * Returns null when the covers are missing, side by side, or too close.
 */
export function cablePath(source: Box | null, flip: Box | null): string | null {
  if (!source || !flip) return null;
  const sx = source.x + source.w / 2;
  const sy = source.y - INSET;
  const fx = flip.x + flip.w / 2;
  const fy = flip.y + flip.h + INSET;
  const gap = sy - fy;
  if (!(gap >= MIN_GAP)) return null;
  const bend = Math.min(MAX_BEND, gap * 0.14);
  const pull = gap * 0.42;
  return `M${r(sx)} ${r(sy)}C${r(sx + bend)} ${r(sy - pull)} ${r(fx - bend)} ${r(fy + pull)} ${r(fx)} ${r(fy)}`;
}

/**
 * An element's box relative to `root`'s padding edge — the same origin an
 * `absolute inset-0` SVG inside `root` draws from.
 *
 * Offsets rather than getBoundingClientRect: the card slides in with a
 * transform and the covers scale during the timeline, and a ResizeObserver
 * firing mid-animation must not bake either into the cable.
 */
export function boxIn(el: HTMLElement | null, root: HTMLElement): Box | null {
  if (!el) return null;
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node === root ? { x, y, w: el.offsetWidth, h: el.offsetHeight } : null;
}
