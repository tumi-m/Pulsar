/**
 * Pulsar — Observatory wordmark engine (P1)
 *
 * Pure logic for the hero: the "PULSAR" wordmark rasterised to point
 * targets, plus the constellation that assembles it. Kept free of
 * three.js so every rule here is unit-testable in jsdom.
 *
 * Motion grammar (DESIGN_3D_IMPLEMENTATION_PLAN §2.4):
 *   - authoritative easing  cubic-bezier(0.22, 1, 0.36, 1)
 *   - choreography          anticipation → reveal → settle
 */

export interface Point2 {
  x: number;
  y: number;
}

/** Deterministic RNG so the constellation is stable across reloads. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * cubic-bezier(…) easing solver (Newton–Raphson, gre-style)
 * ------------------------------------------------------------------ */

function bezA(x1: number, x2: number): number {
  return 1 - 3 * x2 + 3 * x1;
}
function bezB(x1: number, x2: number): number {
  return 3 * x2 - 6 * x1;
}
function bezC(x1: number): number {
  return 3 * x1;
}
function calcBezier(t: number, x1: number, x2: number): number {
  return ((bezA(x1, x2) * t + bezB(x1, x2)) * t + bezC(x1)) * t;
}
function bezSlope(t: number, x1: number, x2: number): number {
  return 3 * bezA(x1, x2) * t * t + 2 * bezB(x1, x2) * t + bezC(x1);
}

/** Solve the x→t inversion with Newton–Raphson; clamped for stability. */
function solveT(x: number, x1: number, x2: number): number {
  let t = x;
  for (let i = 0; i < 8; i++) {
    const slope = bezSlope(t, x1, x2);
    if (Math.abs(slope) < 1e-6) break;
    const err = calcBezier(t, x1, x2) - x;
    t -= err / slope;
    if (t <= 0) return 0;
    if (t >= 1) return 1;
  }
  return t;
}

export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  if (x1 === y1 && x2 === y2) return (t) => t; // linear fast-path
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return calcBezier(solveT(t, x1, x2), y1, y2);
  };
}

/** The authoritative easing for every Observatory move. */
export const AUTHORITY = cubicBezier(0.22, 1, 0.36, 1);

/* ------------------------------------------------------------------ *
 * Rasterise text to normalised 2D sample points
 * ------------------------------------------------------------------ */

export interface SampleOptions {
  /** pixel stride between samples (smaller = denser) */
  step?: number;
  /** hard cap on returned points */
  maxPoints?: number;
}

/**
 * Sample every `step`-th opaque pixel of an RGBA buffer and normalise the
 * results to roughly [-0.5, 0.5] (y grows upward). When more points are
 * found than `maxPoints`, an even spread is kept (no clustering).
 */
export function sampleAlphaMask(
  width: number,
  height: number,
  data: ArrayLike<number>,
  { step = 4, maxPoints = 2400 }: SampleOptions = {},
): Point2[] {
  const found: Point2[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (data[(y * width + x) * 4 + 3] > 0x80) {
        found.push({ x, y });
      }
    }
  }

  let kept = found;
  if (maxPoints > 0 && found.length > maxPoints) {
    kept = [];
    const stride = found.length / maxPoints;
    for (let i = 0; i < maxPoints; i++) {
      kept.push(found[Math.min(found.length - 1, Math.floor(i * stride))]);
    }
  }

  const aspect = width / height;
  return kept.map(({ x, y }) => ({
    x: (x / width - 0.5) * aspect,
    y: 0.5 - y / height,
  }));
}


/**
 * Rasterise `text` (bold, uppercase, tracked-out grotesk) on an offscreen
 * canvas and return its sample points. Returns `[]` when a 2D context is
 * unavailable (SSR, jsdom) — callers must degrade, never crash.
 */
export function sampleWordmark(
  text: string,
  {
    fontSize = 120,
    step = 3,
    maxPoints = 2400,
  }: SampleOptions & { fontSize?: number } = {},
): Point2[] {
  if (typeof document === "undefined" || !text) return [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const font = `900 ${fontSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.font = font;
  const tracking = fontSize * 0.08;
  const chars = [...text.toUpperCase()];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total =
    widths.reduce((sum, w) => sum + w, 0) + tracking * Math.max(0, chars.length - 1);

  canvas.width = Math.ceil(total + fontSize * 0.4);
  canvas.height = Math.ceil(fontSize * 1.5);
  ctx.font = font; // resizing resets canvas state
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";

  let x = fontSize * 0.2;
  const midY = canvas.height / 2;
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x, midY);
    x += widths[i] + tracking;
  });

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return sampleAlphaMask(canvas.width, canvas.height, image.data, { step, maxPoints });
}

/* ------------------------------------------------------------------ *
 * Constellation — the snap that assembles the wordmark
 * ------------------------------------------------------------------ */

export interface Constellation {
  count: number;
  /** scattered shell the particles fly from (3 * count) */
  start: Float32Array;
  /** wordmark targets, in world units (3 * count) */
  target: Float32Array;
  /** per-particle delay in seconds (Bass-style left→right sweep) */
  delay: Float32Array;
  flightSeconds: number;
}

export interface ConstellationOptions {
  /** world-width of the assembled wordmark */
  scale?: number;
  /** z-depth of the assembled letters */
  depthJitter?: number;
  /** min/max distance of the scattered start shell */
  shell?: [number, number];
  flightSeconds?: number;
  /** total stagger across the sweep */
  staggerSeconds?: number;
  seed?: number;
}

export function buildConstellation(
  points: Point2[],
  {
    scale = 5,
    depthJitter = 0.07,
    shell = [7, 15],
    flightSeconds = 1.8,
    staggerSeconds = 1,
    seed = 1,
  }: ConstellationOptions = {},
): Constellation {
  const count = points.length;
  const start = new Float32Array(count * 3);
  const target = new Float32Array(count * 3);
  const delay = new Float32Array(count);
  const rand = mulberry32(seed);

  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  const span = Math.max(1e-6, maxX - minX);

  const [rMin, rMax] = shell;
  for (let i = 0; i < count; i++) {
    const p = points[i];
    // random direction on a sphere, scaled into the shell
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const r = rMin + rand() * (rMax - rMin);
    start[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    start[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    start[i * 3 + 2] = r * Math.cos(phi);

    target[i * 3] = p.x * scale;
    target[i * 3 + 1] = p.y * scale;
    target[i * 3 + 2] = (rand() - 0.5) * 2 * depthJitter;

    // left-to-right sweep with a whisper of jitter — never a metronome
    const sweep = (p.x - minX) / span;
    delay[i] = sweep * staggerSeconds + rand() * staggerSeconds * 0.12;
  }

  return { count, start, target, delay, flightSeconds };
}
