/**
 * npm run motion:lottie
 *
 * Builds Pulsar's "working on it" mark — a cassette playing in its window — as
 * a Lottie file, from code, and puts the dotLottie renderer that plays it next
 * to it in public/lottie/.
 *
 * Generated rather than drawn in After Effects for the same reasons the sounds
 * are synthesised (scripts/motion/build-sfx.mjs): the output is byte-for-byte
 * reproducible, the geometry is computed instead of eyeballed, and changing it
 * is a reviewed diff rather than an opaque export.
 *
 * The file uses shape layers only — ellipses, rects, paths, solid and linear
 * gradient fills, strokes — with no images, masks, mattes or expressions.
 * Those are the parts of the format every player implements the same way, so
 * the loader looks identical in dotLottie (ThorVG), lottie-web and Skottie.
 *
 * THE LOOP. Two seconds at 30 fps. A tape that visibly empties one reel into
 * the other cannot loop: the packs would snap back every two seconds. So the
 * packs hold still, as they do over any two seconds of a real tape, and the
 * motion is the reels turning — at different speeds, because the tape moves at
 * one speed past both and the emptier take-up reel has less radius to cover it
 * with (ω = v / r). Each hub has six-fold symmetry, so a reel that turns a
 * whole number of sixths of a revolution per loop ends on a frame identical to
 * its first; buildTapeLoader() refuses any geometry that would break that.
 *
 * THE RUNTIME. @lottiefiles/dotlottie-web fetches its WASM renderer from
 * jsDelivr unless told otherwise. A loader that depends on a third-party CDN
 * shows nothing when that CDN is blocked, slow or offline, so this copies the
 * exact WASM build the installed React wrapper uses into public/lottie/, and
 * components/TapeLoader.tsx points the player at it. test/lottie.test.ts fails
 * if a dependency bump leaves the copy stale — the glue code and the binary
 * must match.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OUT_DIR = path.join(ROOT, "public", "lottie");
export const ANIMATION_FILE = "tape-loader.json";
export const WASM_FILE = "dotlottie-player.wasm";

export const FPS = 30;
export const LOOP_SECONDS = 2;
export const LOOP_FRAMES = FPS * LOOP_SECONDS;
export const WIDTH = 240;
export const HEIGHT = 120;
/** Spokes per hub. Sets the rotational symmetry the loop seam relies on. */
export const SPOKES = 6;
/** It plays inside a chat row; anything near this size is doing too much. */
export const MAX_BYTES = 20 * 1024;

/* ── palette ─────────────────────────────────────────────────────
   The same materials as the J-card artwork fallback (.jcard-* in
   app/globals.css), so the loader reads as the same object. */
const C = {
  shellTop: "#262e37",
  shellMid: "#181d23",
  shellBottom: "#101317",
  trim: "#3a4450",
  well: "#0b0d10", // deck-900: spindle holes, the gap round each hub
  labelTop: "#f2e9d3",
  labelBottom: "#e3d5b4",
  print: "#12161a", // deck-800: anything printed on the label
  windowTop: "#07090b",
  windowBottom: "#111519",
  cream: "#efe4cc", // --label-cream: the hubs
  tape: "#3a2a20", // --tape-brown
  tapeEdge: "#56412f", // the lit edge of a pack, so it holds against the dark window
  sony: "#f2662c",
  lcd: "#7ed9ae",
} as const;

/* ── geometry (artboard px) ────────────────────────────────────── */
const REEL_Y = 60;
/** Supply on the left with more tape wound on it, take-up on the right. */
export const REELS = {
  supply: { x: 90, r: 27 },
  takeup: { x: 150, r: 18 },
} as const;
const HUB_R = 10.5;
const HUB_GAP_R = 12.5;
const WINDOW = { x: 57, y: 30, w: 126, h: 60 };
/**
 * Degrees the supply reel turns per loop. Sets the apparent tape speed; the
 * take-up reel's turn follows from the radii. 240° is 0.33 rev/s — calm enough
 * to sit beside text, and 4°/frame stays far from the 30°/frame at which
 * six-fold spokes would strobe backwards.
 */
const SUPPLY_TURN = 240;
/**
 * Lottie rotation is clockwise-positive. Seen from the label side during play,
 * tape leaves the supply reel along the bottom and winds onto the take-up reel
 * along the bottom, so both reels turn anticlockwise.
 */
const PLAY_DIRECTION = -1;

/* ── Lottie primitives ───────────────────────────────────────────
   Two decimals everywhere: sub-pixel enough at 3x, and it keeps the file
   small and the diff readable. */
type Vec = [number, number];
const n = (v: number) => Math.round(v * 100) / 100;
const still = <T>(k: T) => ({ a: 0, k });

function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => Math.round((c / 255) * 1000) / 1000) as [
    number,
    number,
    number,
  ];
}

const ellipse = (c: Vec, r: number) => ({ ty: "el", d: 1, p: still(c.map(n)), s: still([n(r * 2), n(r * 2)]) });
const rect = (c: Vec, size: Vec, r = 0) => ({
  ty: "rc",
  d: 1,
  p: still(c.map(n)),
  s: still(size.map(n)),
  r: still(n(r)),
});
function polyline(points: Vec[], closed: boolean) {
  const zeros = points.map(() => [0, 0]);
  return {
    ty: "sh",
    d: 1,
    ks: still({ c: closed, v: points.map((p) => p.map(n)), i: zeros, o: zeros }),
  };
}
const fill = (hex: string, opacity = 100) => ({ ty: "fl", c: still([...rgb(hex), 1]), o: still(opacity), r: 1 });
const stroke = (hex: string, width: number, opacity = 100) => ({
  ty: "st",
  c: still([...rgb(hex), 1]),
  o: still(opacity),
  w: still(width),
  lc: 2, // round caps
  lj: 2, // round joins
  ml: 4,
});
/** Linear gradient. `stops` are [offset 0–1, colour]. */
const gradient = (stops: [number, string][], from: Vec, to: Vec) => ({
  ty: "gf",
  o: still(100),
  r: 1,
  t: 1,
  s: still(from),
  e: still(to),
  g: { p: stops.length, k: still(stops.flatMap(([o, hex]) => [o, ...rgb(hex)])) },
});

/**
 * Shapes and the paint they share, in a group of their own. Lottie paints a
 * fill over every path above it in the same group, so only shapes that share
 * paint share a group, and the stacking stays obvious: earlier in a list is
 * drawn on top.
 */
function group(nm: string, items: object[]) {
  return {
    ty: "gr",
    nm,
    it: [
      ...items,
      {
        ty: "tr",
        p: still([0, 0]),
        a: still([0, 0]),
        s: still([100, 100]),
        r: still(0),
        o: still(100),
      },
    ],
  };
}

type Prop = ReturnType<typeof still> | { a: 1; k: object[] };

/** Keyframes that move at a constant rate from the first frame to the last. */
const linear = (from: number, to: number): Prop => ({
  a: 1,
  k: [
    { t: 0, s: [from], o: { x: [0], y: [0] }, i: { x: [1], y: [1] } },
    { t: LOOP_FRAMES, s: [to] },
  ],
});

/** Keyframes through `values`, evenly spaced across the loop, eased in and out. */
const eased = (values: number[]): Prop => ({
  a: 1,
  k: values.map((v, i) => {
    const t = n((i * LOOP_FRAMES) / (values.length - 1));
    return i === values.length - 1
      ? { t, s: [v] }
      : { t, s: [v], o: { x: [0.42], y: [0] }, i: { x: [0.58], y: [1] } };
  }),
});

function layer(ind: number, nm: string, shapes: object[], opts: { at?: Vec; r?: Prop; o?: Prop } = {}) {
  const [x, y] = opts.at ?? [0, 0];
  return {
    ddd: 0,
    ind,
    ty: 4,
    nm,
    sr: 1,
    ks: {
      o: opts.o ?? still(100),
      r: opts.r ?? still(0),
      p: still([x, y, 0]),
      a: still([0, 0, 0]),
      s: still([100, 100, 100]),
    },
    ao: 0,
    shapes,
    ip: 0,
    op: LOOP_FRAMES,
    st: 0,
    bm: 0,
  };
}

/* ── parts ───────────────────────────────────────────────────── */

/**
 * A hub in its own coordinates, centred on 0,0 so the layer can turn it about
 * the spindle: a cream rim, six cream spokes over the dark spindle hole, and
 * the dark gap that separates the hub from the wound tape.
 */
function hub() {
  // Each spoke is a quad computed here rather than a rect in a rotated group
  // of its own: one group for all six is less than half the bytes.
  const [from, to, half] = [1.5, HUB_R, 1.6];
  const spokes = Array.from({ length: SPOKES }, (_, i) => {
    // Start on a vertical spoke: the still frame reads as upright.
    const a = ((90 + (i * 360) / SPOKES) * Math.PI) / 180;
    const [cos, sin] = [Math.cos(a), Math.sin(a)];
    const at = (x: number, y: number): Vec => [x * cos - y * sin, x * sin + y * cos];
    return polyline([at(from, -half), at(to, -half), at(to, half), at(from, half)], true);
  });
  return [
    group("spindle", [ellipse([0, 0], 2.6), fill(C.well)]),
    group("spokes", [...spokes, fill(C.cream)]),
    group("hole", [ellipse([0, 0], HUB_R - 3), fill(C.well)]),
    // The rim, and the gap round it drawn as a stroke straddling its edge.
    group("rim", [
      ellipse([0, 0], (HUB_R + HUB_GAP_R) / 2),
      stroke(C.well, HUB_GAP_R - HUB_R),
      fill(C.cream),
    ]),
  ];
}

/**
 * The tape between the packs, on their common lower tangent — the side the
 * tape leaves one reel and reaches the other. Unequal radii tilt it slightly,
 * which is what makes it read as a strip running between two different packs.
 */
export function tapePath(): [Vec, Vec] {
  const { supply, takeup } = REELS;
  // A unit normal n with n·(c2 − c1) = r1 − r2 puts each centre exactly its
  // own radius above the line, so the line touches both circles.
  const nx = (supply.r - takeup.r) / (takeup.x - supply.x);
  const ny = Math.sqrt(1 - nx * nx);
  return [
    [supply.x + supply.r * nx, REEL_Y + supply.r * ny],
    [takeup.x + takeup.r * nx, REEL_Y + takeup.r * ny],
  ];
}

/** Degrees each reel turns per loop, signed for the direction of play. */
export function reelTurns() {
  const { supply, takeup } = REELS;
  const step = 360 / SPOKES;
  const turns = {
    supply: SUPPLY_TURN,
    // Same tape speed past both reels: angle × radius is equal.
    takeup: (SUPPLY_TURN * supply.r) / takeup.r,
  };
  for (const [name, deg] of Object.entries(turns)) {
    if (Math.abs(deg % step) > 1e-9) {
      throw new Error(
        `${name} reel turns ${deg}° per loop — not a multiple of ${step}°, so the loop would jump. ` +
          `Adjust SUPPLY_TURN or the radii.`,
      );
    }
  }
  return { supply: PLAY_DIRECTION * turns.supply, takeup: PLAY_DIRECTION * turns.takeup };
}

export function buildTapeLoader() {
  const { supply, takeup } = REELS;
  const turns = reelTurns();
  const [tapeFrom, tapeTo] = tapePath();
  const cx = WIDTH / 2;
  const win = { cx: WINDOW.x + WINDOW.w / 2, cy: WINDOW.y + WINDOW.h / 2 };
  const ledAt: Vec = [(20 + WINDOW.x) / 2, REEL_Y];
  const sideAt: Vec = [(WINDOW.x + WINDOW.w + 220) / 2, REEL_Y];

  // Bottom to top in the stack; reversed into Lottie's top-first order below.
  const stack = [
    layer(0, "shell", [
      // Screws, then the raised guide block the heads reach through.
      group("screws", [
        ...(
          [
            [11, 11],
            [WIDTH - 11, 11],
            [11, HEIGHT - 11],
            [WIDTH - 11, HEIGHT - 11],
          ] as Vec[]
        ).map((p) => ellipse(p, 2.5)),
        fill(C.trim),
      ]),
      group("capstans", [ellipse([cx - 24, 109], 3.4), ellipse([cx + 24, 109], 3.4), fill(C.well)]),
      group("guide block", [
        polyline(
          [
            [cx - 50, HEIGHT - 4],
            [cx - 40, 101],
            [cx + 40, 101],
            [cx + 50, HEIGHT - 4],
          ],
          true,
        ),
        stroke(C.trim, 1.5),
        fill(C.print),
      ]),
      group("body", [
        rect([cx, HEIGHT / 2], [WIDTH - 8, HEIGHT - 8], 10),
        stroke(C.trim, 2),
        gradient(
          [
            [0, C.shellTop],
            [0.55, C.shellMid],
            [1, C.shellBottom],
          ],
          [100, 4],
          [140, HEIGHT - 4],
        ),
      ]),
    ]),
    layer(0, "label", [
      // A–side mark, the LED's bezel, the maker's stripe, then the card.
      group("side A", [
        polyline(
          [
            [sideAt[0] - 6.5, sideAt[1] + 8],
            [sideAt[0], sideAt[1] - 8],
            [sideAt[0] + 6.5, sideAt[1] + 8],
          ],
          false,
        ),
        polyline(
          [
            [sideAt[0] - 4.47, sideAt[1] + 3],
            [sideAt[0] + 4.47, sideAt[1] + 3],
          ],
          false,
        ),
        stroke(C.print, 2.8, 75),
      ]),
      group("bezel", [ellipse(ledAt, 6), fill(C.print)]),
      group("stripe", [rect([cx, 19], [200, 10]), fill(C.sony)]),
      group("card", [
        rect([cx, 54], [200, 88], 6),
        gradient(
          [
            [0, C.labelTop],
            [1, C.labelBottom],
          ],
          [cx, 10],
          [cx, 98],
        ),
      ]),
    ]),
    layer(0, "window", [
      group("glass", [
        rect([win.cx, win.cy], [WINDOW.w, WINDOW.h], WINDOW.h / 2),
        stroke(C.print, 1.5),
        gradient(
          [
            [0, C.windowTop],
            [1, C.windowBottom],
          ],
          [win.cx, WINDOW.y],
          [win.cx, WINDOW.y + WINDOW.h],
        ),
      ]),
    ]),
    layer(0, "tape", [
      group("strip", [polyline([tapeFrom, tapeTo], false), stroke(C.tapeEdge, 2.6)]),
      // A faint inner wrap on each pack, so it reads as wound tape, not a disc.
      group("wraps", [
        ellipse([supply.x, REEL_Y], supply.r * 0.74),
        ellipse([takeup.x, REEL_Y], takeup.r * 0.84),
        stroke(C.tapeEdge, 1, 55),
      ]),
      group("packs", [
        ellipse([supply.x, REEL_Y], supply.r),
        ellipse([takeup.x, REEL_Y], takeup.r),
        stroke(C.tapeEdge, 1.5),
        fill(C.tape),
      ]),
    ]),
    layer(0, "takeup hub", hub(), { at: [takeup.x, REEL_Y], r: linear(0, turns.takeup) }),
    layer(0, "supply hub", hub(), { at: [supply.x, REEL_Y], r: linear(0, turns.supply) }),
    layer(
      0,
      "glint",
      // Light across the window glass. Kept inside the window's straight top
      // and bottom edges, since there is no mask to clip it to the pill.
      [
        group("glint", [
          polyline(
            [
              [124, WINDOW.y + 1],
              [137, WINDOW.y + 1],
              [117, WINDOW.y + WINDOW.h - 1],
              [104, WINDOW.y + WINDOW.h - 1],
            ],
            true,
          ),
          polyline(
            [
              [141, WINDOW.y + 1],
              [145, WINDOW.y + 1],
              [125, WINDOW.y + WINDOW.h - 1],
              [121, WINDOW.y + WINDOW.h - 1],
            ],
            true,
          ),
          fill("#ffffff", 6),
        ]),
      ],
    ),
    // The Walkman's play LED, breathing once per loop: "running" without
    // flashing at anyone.
    layer(
      0,
      "led",
      [group("core", [ellipse(ledAt, 3.8), fill(C.lcd)]), group("halo", [ellipse(ledAt, 9), fill(C.lcd, 28)])],
      { o: eased([100, 40, 100]) },
    ),
  ];

  const layers = stack.reverse().map((l, i) => ({ ...l, ind: i + 1 }));

  return {
    v: "5.12.2",
    meta: { g: "Pulsar scripts/motion/build-lottie.ts" },
    fr: FPS,
    ip: 0,
    op: LOOP_FRAMES,
    w: WIDTH,
    h: HEIGHT,
    nm: "tape-loader",
    ddd: 0,
    assets: [],
    layers,
    markers: [],
  };
}

/**
 * The WASM renderer the installed @lottiefiles/dotlottie-react will load —
 * resolved through the wrapper, so a nested copy of dotlottie-web (if versions
 * ever diverge) is the one that gets matched.
 */
export function runtimeWasmPath(): string {
  const fromRoot = createRequire(path.join(ROOT, "package.json"));
  const fromReact = createRequire(fromRoot.resolve("@lottiefiles/dotlottie-react"));
  return path.join(path.dirname(fromReact.resolve("@lottiefiles/dotlottie-web")), WASM_FILE);
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

function main() {
  const json = JSON.stringify(buildTapeLoader());
  const bytes = Buffer.byteLength(json);
  if (bytes > MAX_BYTES) {
    console.error(`✗ ${ANIMATION_FILE} is ${kb(bytes)}, budget ${kb(MAX_BYTES)}`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, ANIMATION_FILE), json);

  const wasmFrom = runtimeWasmPath();
  copyFileSync(wasmFrom, path.join(OUT_DIR, WASM_FILE));
  const wasmBytes = readFileSync(wasmFrom).byteLength;

  const turns = reelTurns();
  console.table([
    { file: ANIMATION_FILE, size: kb(bytes), note: `${WIDTH}x${HEIGHT}, ${LOOP_FRAMES} frames @ ${FPS} fps` },
    { file: WASM_FILE, size: kb(wasmBytes), note: `copied from ${path.relative(ROOT, wasmFrom)}` },
  ]);
  console.log(`  reels per loop: supply ${turns.supply}°, take-up ${turns.takeup}°`);
  console.log(`\n✓ ${path.relative(ROOT, OUT_DIR)}/`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
