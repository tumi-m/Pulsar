import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ANIMATION_FILE,
  FPS,
  HEIGHT,
  LOOP_FRAMES,
  LOOP_SECONDS,
  MAX_BYTES,
  OUT_DIR,
  REELS,
  SPOKES,
  WASM_FILE,
  WIDTH,
  buildTapeLoader,
  reelTurns,
  runtimeWasmPath,
  tapePath,
} from "../scripts/motion/build-lottie";

/**
 * public/lottie/tape-loader.json, as committed, checked against what any
 * Lottie player needs to play it identically and loop it without a seam.
 * Fix a failure in scripts/motion/build-lottie.ts, then `npm run motion:lottie`.
 */

type Keyframe = { t: number; s: number[] };
type Animated = { a: 1; k: Keyframe[] };
type Layer = { ty: number; nm: string; ip: number; op: number; ks: Record<string, { a: number; k: unknown }> };

const raw = readFileSync(path.join(OUT_DIR, ANIMATION_FILE), "utf8");
const anim = JSON.parse(raw) as {
  v: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  assets: unknown[];
  layers: Layer[];
};

/** Every value in the tree, with the key it sits under. */
function* walk(node: unknown, key = ""): Generator<[string, unknown]> {
  yield [key, node];
  if (Array.isArray(node)) for (const v of node) yield* walk(v, key);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) yield* walk(v, k);
}

/** Every animated property in the file: `{ a: 1, k: [keyframes] }`. */
const animated = [...walk(anim)]
  .map(([k, v]) => [k, v] as [string, Animated])
  .filter(([, v]) => v && typeof v === "object" && (v as { a?: number }).a === 1);

describe("tape-loader.json", () => {
  it("is a v5 Lottie on the 240x120 artboard at 30 fps", () => {
    expect(anim.v).toMatch(/^5\.\d+\.\d+$/);
    expect(anim.fr).toBe(30);
    expect([anim.w, anim.h]).toEqual([240, 120]);
    expect([anim.w, anim.h, anim.fr]).toEqual([WIDTH, HEIGHT, FPS]);
  });

  it("spans exactly one two-second loop", () => {
    expect(anim.ip).toBe(0);
    expect(anim.op - anim.ip).toBe(LOOP_FRAMES);
    expect(LOOP_FRAMES).toBe(LOOP_SECONDS * FPS);
    expect(LOOP_SECONDS).toBe(2);
  });

  it("uses shape layers only, each live for the whole loop", () => {
    expect(anim.layers.length).toBeGreaterThan(0);
    for (const l of anim.layers) {
      expect(l.ty, l.nm).toBe(4);
      for (const prop of ["o", "r", "p", "a", "s"]) expect(l.ks[prop], `${l.nm}.ks.${prop}`).toBeDefined();
      expect(l.ip, l.nm).toBeLessThanOrEqual(anim.ip);
      expect(l.op, l.nm).toBeGreaterThanOrEqual(anim.op);
    }
  });

  it("has nothing a player could render differently: no images, masks, mattes or expressions", () => {
    expect(anim.assets).toEqual([]);
    const allowed = new Set(["gr", "el", "rc", "sh", "fl", "st", "gf", "tr"]);
    for (const [key, value] of walk(anim.layers)) {
      // shape item types
      if (key === "ty" && typeof value === "string") expect(allowed.has(value), value).toBe(true);
      // an expression is a string `x` on a property
      if (key === "x") expect(typeof value, "expression").not.toBe("string");
      expect(["masksProperties", "tt", "td", "refId"]).not.toContain(key);
    }
  });

  it("turns both reels anticlockwise, the take-up faster, each ending where it looks like it started", () => {
    const rotations = anim.layers
      .filter((l) => l.ks.r.a === 1)
      .map((l) => ({ nm: l.nm, k: (l.ks.r as Animated).k }));
    expect(rotations.map((r) => r.nm).sort()).toEqual(["supply hub", "takeup hub"]);

    const step = 360 / SPOKES;
    const turn: Record<string, number> = {};
    for (const { nm, k } of rotations) {
      const [first, last] = [k[0], k[k.length - 1]];
      expect(first.t, nm).toBe(anim.ip);
      expect(last.t, nm).toBe(anim.op);
      const delta = last.s[0] - first.s[0];
      expect(delta, nm).toBeLessThan(0);
      // Six identical spokes: a whole number of sixths of a turn is a frame
      // identical to the first, so frame op wraps onto frame ip invisibly.
      expect(Math.abs(delta % step), `${nm} turns ${delta}°`).toBeLessThan(1e-9);
      turn[nm] = delta;
    }
    expect(Math.abs(turn["takeup hub"])).toBeGreaterThan(Math.abs(turn["supply hub"]));
    // Same tape speed past both reels: angle x radius is equal.
    expect(turn["supply hub"] * REELS.supply.r).toBeCloseTo(turn["takeup hub"] * REELS.takeup.r, 6);
  });

  it("returns every other animated value to its starting value at the seam", () => {
    const others = animated.filter(([key]) => key !== "r");
    expect(others.length).toBeGreaterThan(0); // the LED
    for (const [key, { k }] of others) {
      expect(k[0].t, key).toBe(anim.ip);
      expect(k[k.length - 1].t, key).toBe(anim.op);
      expect(k[k.length - 1].s, key).toEqual(k[0].s);
    }
  });

  it("paints in the Walkman palette", () => {
    const hex = new Set<string>();
    for (const [key, value] of walk(anim.layers)) {
      if (key !== "c" || !value || typeof value !== "object") continue;
      const [r, g, b] = (value as { k: number[] }).k;
      hex.add("#" + [r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join(""));
    }
    expect(hex).toContain("#f2662c"); // sony orange stripe
    expect(hex).toContain("#7ed9ae"); // lcd green LED
    expect(hex).toContain("#efe4cc"); // label cream hubs
    expect(hex).toContain("#3a2a20"); // tape brown
  });

  it("is minified and inside its size budget", () => {
    expect(raw).not.toMatch(/\n|  /);
    expect(Buffer.byteLength(raw)).toBeLessThan(MAX_BYTES);
    expect(MAX_BYTES).toBeLessThanOrEqual(20 * 1024);
  });

  it("is exactly what the generator builds (rerun npm run motion:lottie if not)", () => {
    expect(raw).toBe(JSON.stringify(buildTapeLoader()));
  });
});

describe("build-lottie geometry", () => {
  it("lays the tape on the packs' common lower tangent", () => {
    const [a, b] = tapePath();
    const { supply, takeup } = REELS;
    // Perpendicular distance from each reel centre to the strip's line equals
    // that reel's radius: the strip touches both packs and cuts neither.
    const dist = (cx: number, cy: number) =>
      Math.abs((b[0] - a[0]) * (a[1] - cy) - (a[0] - cx) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    expect(dist(supply.x, 60)).toBeCloseTo(supply.r, 9);
    expect(dist(takeup.x, 60)).toBeCloseTo(takeup.r, 9);
    // Below both centres.
    expect(a[1]).toBeGreaterThan(60);
    expect(b[1]).toBeGreaterThan(60);
  });

  it("derives seamless reel turns from the radii", () => {
    const turns = reelTurns();
    expect(turns.supply).toBe(-240);
    expect(turns.takeup).toBe(-360);
  });
});

describe("self-hosted dotLottie renderer", () => {
  it("is byte-identical to the WASM the installed player loads (rerun npm run motion:lottie if not)", () => {
    const served = readFileSync(path.join(OUT_DIR, WASM_FILE));
    const installed = readFileSync(runtimeWasmPath());
    // Compare sizes first so a mismatch fails with a readable message rather
    // than a 1.2 MB buffer diff.
    expect(served.byteLength).toBe(installed.byteLength);
    expect(served.equals(installed)).toBe(true);
  });
});
