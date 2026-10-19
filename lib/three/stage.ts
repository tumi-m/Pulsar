/**
 * Pulsar — Observatory staging (timeline + camera framing)
 *
 * The beats of the /experience sequence and the two camera poses it moves
 * between, kept free of three.js so the choreography is unit-testable and
 * every component reads the same clock marks instead of inventing its own.
 *
 *   0.0  anticipation (fog closed, stars only)
 *   1.1  wordmark assembles from the constellation
 *   2.6  curtain: fog opens, grid fades in (chromatic aberration rides it)
 *   4.2  set-piece: camera settles onto the crate, records drop
 */

export type Vec3 = [number, number, number];

export const SEQUENCE = {
  /** Wordmark begins after a beat of anticipation (fog still closed). */
  wordmark: 1.1,
  /** Grid + fog curtain start once the letters have mostly landed. */
  curtain: 2.6,
  curtainSeconds: 2.2,
  /** The last letters land ~4.0s; the crate takes the stage just after. */
  setPiece: 4.2,
  /** Camera travel from the opening frame to the crate frame. */
  cameraSeconds: 2.6,
} as const;

/**
 * What the set-piece is doing, for the HUD (and the e2e checks that read it):
 * the opening titles, records in flight, records at rest, or the still
 * (reduced-motion) arrangement.
 */
export type Stage = "opening" | "dropping" | "settled" | "static";

/** Vertical field of view shared by the Canvas and the framing maths. */
export const FOV = 60;

/** The curtain grid's height — also the floor the records land on. */
export const FLOOR_Y = -3;

export interface Pose {
  position: Vec3;
  target: Vec3;
}

/** The hero frame: wordmark dead centre. */
export const OPENING_POSE: Pose = { position: [0, 0, 8], target: [0, 0, 0] };

export const OPENING_DISTANCE = Math.hypot(...OPENING_POSE.position);

/**
 * The camera's slow sway (world units added to its position; it keeps
 * looking at the same point). The physics walls are placed outside every
 * frame the sway can reach, so they read it from here too.
 */
export const SWAY = { x: 0.6, y: 0.25 } as const;

/**
 * The crate frame: looking down ~34° so the visitor sees into the crate,
 * with the wordmark riding in the upper third. Any closer and the ~13-unit
 * wordmark crowds the frame edges and the HUD.
 */
export const DIG_POSE: Pose = { position: [0, 3.4, 9.2], target: [0, -2.3, 0.7] };

/** Crate (3.0 wide) plus the records laid beside it must stay in frame. */
export const DIG_HALF_WIDTH = 3.0;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Half the visible width at `distance` for a perspective camera. */
export function visibleHalfWidth(aspect: number, fovDeg: number, distance: number): number {
  return distance * Math.tan(((fovDeg / 2) * Math.PI) / 180) * aspect;
}

/**
 * Pull the camera back along its own view axis until `halfWidth` fits at the
 * target. Desktop frames are untouched; a portrait phone backs off instead of
 * cropping the crate — scaling the physics world would change how it falls.
 */
export function fitPose(pose: Pose, aspect: number, fovDeg: number, halfWidth: number): Pose {
  const [px, py, pz] = pose.position;
  const [tx, ty, tz] = pose.target;
  const dx = px - tx;
  const dy = py - ty;
  const dz = pz - tz;
  const dist = Math.hypot(dx, dy, dz);
  if (!(aspect > 0) || dist === 0) return pose;
  const need = halfWidth / visibleHalfWidth(aspect, fovDeg, 1);
  if (need <= dist) return pose;
  const k = need / dist;
  return { position: [tx + dx * k, ty + dy * k, tz + dz * k], target: pose.target };
}

/**
 * Uniform scale (≤ 1) that fits content of `halfWidth` into the frame with a
 * margin. The wordmark is ~13 units wide — at a phone's 0.46 aspect it would
 * otherwise run off both edges.
 */
export function fitScale(
  aspect: number,
  fovDeg: number,
  distance: number,
  halfWidth: number,
  margin = 0.9,
): number {
  if (!(halfWidth > 0) || !(aspect > 0)) return 1;
  return Math.min(1, (visibleHalfWidth(aspect, fovDeg, distance) * margin) / halfWidth);
}

/**
 * Where the bottom edge of the frame meets the floor (z, on the centre
 * line). Anything nearer the camera than this is out of shot — the place to
 * put an invisible wall, so nothing is ever seen leaning on thin air.
 */
export function frameNearFloorZ(pose: Pose, fovDeg: number, floorY: number): number {
  const [, py, pz] = pose.position;
  const [, ty, tz] = pose.target;
  const pitch = Math.atan2(py - ty, pz - tz);
  const bottom = pitch + ((fovDeg / 2) * Math.PI) / 180;
  if (bottom >= Math.PI / 2) return pz;
  return pz - (py - floorY) / Math.tan(bottom);
}

interface Basis {
  /** forward (unit, toward the target), right, up — three's lookAt with up = +y */
  f: Vec3;
  r: Vec3;
  u: Vec3;
}

function basis(pose: Pose): Basis {
  const [px, py, pz] = pose.position;
  const [tx, ty, tz] = pose.target;
  const len = Math.hypot(tx - px, ty - py, tz - pz) || 1;
  const f: Vec3 = [(tx - px) / len, (ty - py) / len, (tz - pz) / len];
  // right = f × up, flattened (up is +y, so it never tips)
  const rl = Math.hypot(f[2], f[0]) || 1;
  const r: Vec3 = [-f[2] / rl, 0, f[0] / rl];
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { f, r, u };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Where a world point lands in the frame: NDC x/y (±1 at the frame edges)
 * and its view depth (what three's fog reads). Depth ≤ 0 is behind the camera.
 */
export function projectPoint(
  pose: Pose,
  aspect: number,
  fovDeg: number,
  p: Vec3,
): { x: number; y: number; depth: number } {
  const { f, r, u } = basis(pose);
  const v: Vec3 = [p[0] - pose.position[0], p[1] - pose.position[1], p[2] - pose.position[2]];
  const depth = dot(v, f);
  const tanH = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  return { x: dot(v, r) / (depth * tanH * aspect), y: dot(v, u) / (depth * tanH), depth };
}

/**
 * The x where the floor line at depth `z` crosses the left (-1) or right (+1)
 * frame edge. A frame edge meets the floor in a straight line, so this is a
 * linear solve. Null when that floor point would be behind the camera.
 */
export function floorEdgeX(
  pose: Pose,
  aspect: number,
  fovDeg: number,
  floorY: number,
  z: number,
  side: 1 | -1,
): number | null {
  const { f, r } = basis(pose);
  const [px, py, pz] = pose.position;
  const k = side * Math.tan(((fovDeg / 2) * Math.PI) / 180) * aspect;
  // right(x) = k · depth(x), both linear in x
  const denom = r[0] - k * f[0];
  if (denom === 0) return null;
  const rest = (floorY - py) * (k * f[1] - r[1]) + (z - pz) * (k * f[2] - r[2]);
  const x = px + rest / denom;
  const depth = (x - px) * f[0] + (floorY - py) * f[1] + (z - pz) * f[2];
  return depth > 0 ? x : null;
}

/**
 * The z where the floor line at `x` crosses the bottom frame edge — the
 * general form of frameNearFloorZ, for a camera that has swayed sideways.
 */
export function floorEdgeZ(pose: Pose, fovDeg: number, floorY: number, x: number): number | null {
  const { f, u } = basis(pose);
  const [px, py, pz] = pose.position;
  const tanH = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  // up(z) = -tanH · depth(z)
  const denom = u[2] + tanH * f[2];
  if (denom === 0) return null;
  const z = pz - ((x - px) * (u[0] + tanH * f[0]) + (floorY - py) * (u[1] + tanH * f[1])) / denom;
  const depth = (x - px) * f[0] + (floorY - py) * f[1] + (z - pz) * f[2];
  return depth > 0 ? z : null;
}

/**
 * The curtain's fog for how far it has opened (0..1), given the camera's
 * distance from the origin. It was tuned at the opening distance; a camera
 * that has backed off (the crate frame, a portrait phone) carries the
 * curtain with it.
 */
export function curtainFog(open: number, cameraDistance: number): { near: number; far: number } {
  const pushBack = Math.max(0, cameraDistance - OPENING_DISTANCE);
  return { near: 8 - open * 3 + pushBack, far: 14 + open * 22 + pushBack };
}

/** three's linear fog: how much of a point at `depth` is fog (0..1). */
export function fogAmount(depth: number, near: number, far: number): number {
  const x = Math.min(1, Math.max(0, (depth - near) / (far - near)));
  return x * x * (3 - 2 * x);
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const k = clamp01(t);
  const mix = (u: Vec3, v: Vec3): Vec3 => [
    u[0] + (v[0] - u[0]) * k,
    u[1] + (v[1] - u[1]) * k,
    u[2] + (v[2] - u[2]) * k,
  ];
  return { position: mix(a.position, b.position), target: mix(a.target, b.target) };
}

/** Peak RGB split, in UV units — a lens breathing, not a glitch. */
export const ABERRATION_PEAK = 0.0024;

/**
 * Chromatic-aberration envelope: a single swell across the curtain reveal
 * (0 → peak → 0), nothing before or after. Reduced motion gets none.
 */
export function curtainAberration(t: number, reduced = false): number {
  if (reduced) return 0;
  const p = (t - SEQUENCE.curtain) / SEQUENCE.curtainSeconds;
  if (p <= 0 || p >= 1) return 0;
  return ABERRATION_PEAK * Math.sin(Math.PI * p);
}
