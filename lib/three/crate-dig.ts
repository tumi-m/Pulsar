/**
 * Pulsar — "Dig the crate" set-piece (pure logic)
 *
 * What goes in the crate (the visitor's own crate when there is one), where
 * each record is held before it drops, and where it rests when motion is
 * unwelcome. No three.js and no rapier here: the physics chunk is ~2 MB, so
 * everything that can be decided without it is decided here and tested.
 *
 * Units are world units; y is up and the floor is the curtain grid.
 */

import { mulberry32 } from "./wordmark";
import { FLOOR_Y, type Vec3 } from "./stage";

export { FLOOR_Y };

/** The Walkman deck inks (app/globals.css). Grey stands in for ink: a white
 *  sleeve under the key light would cross the bloom threshold and glow. */
export const DECK_PALETTE = {
  sony: "#f2662c",
  tps: "#4e86c7",
  sport: "#ffce0a",
  lcd: "#7ed9ae",
  vu: "#e23b2e",
  ink: "#98a2ab",
} as const;

const PALETTE_ORDER: readonly string[] = [
  DECK_PALETTE.sony,
  DECK_PALETTE.tps,
  DECK_PALETTE.sport,
  DECK_PALETTE.lcd,
  DECK_PALETTE.vu,
  DECK_PALETTE.ink,
];

/** CrateIcon's warm brown. */
export const CRATE_WOOD = "#c08a4e";

/** Shallower than a real crate so the camera, looking down, sees into it. */
export const CRATE = {
  width: 3.0,
  height: 0.7,
  depth: 1.9,
  wall: 0.09,
  floor: 0.07,
  /** Bottom-centre of the crate, sitting on the grid. */
  position: [0, FLOOR_Y, 0.6] as Vec3,
} as const;

export type RecordKind = "lp" | "single" | "tape";

/** Full extents [x, y, z] lying flat; a single's x/z is its diameter. */
export const RECORD_SIZE: Record<RecordKind, Vec3> = {
  lp: [1.1, 0.045, 1.1],
  single: [0.8, 0.03, 0.8],
  tape: [0.72, 0.11, 0.46],
};

const KIND_LABEL: Record<RecordKind, string> = { lp: "LP", single: "7-inch", tape: "Tape" };

export interface RecordSpec {
  id: string;
  kind: RecordKind;
  color: string;
  /** Shown in the HUD when the visitor picks the record up. */
  label: string;
}

export interface CrateRelease {
  id: string;
  artist: string;
  title: string;
  type?: string;
}

/** FNV-1a — stable across reloads, so a release keeps its ink. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function paletteFor(key: string): string {
  return PALETTE_ORDER[hashString(key) % PALETTE_ORDER.length];
}

/** Albums are sleeves, singles are bare 7-inches, EPs come on tape. */
export function kindForType(type: string | undefined): RecordKind {
  if (type === "single") return "single";
  if (type === "ep") return "tape";
  return "lp";
}

/**
 * Read `pulsar_crates_v2` without trusting it: any shape that isn't
 * crates-of-releases yields nothing rather than throwing, and a release
 * saved in two crates drops once.
 */
export function readCrateReleases(raw: string | null): CrateRelease[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: CrateRelease[] = [];
  for (const crate of parsed) {
    const releases = (crate as { releases?: unknown } | null)?.releases;
    if (!Array.isArray(releases)) continue;
    for (const r of releases) {
      const rel = r as Partial<CrateRelease> | null;
      if (!rel || typeof rel.id !== "string" || seen.has(rel.id)) continue;
      if (typeof rel.title !== "string" || typeof rel.artist !== "string") continue;
      seen.add(rel.id);
      out.push({
        id: rel.id,
        artist: rel.artist,
        title: rel.title,
        type: typeof rel.type === "string" ? rel.type : undefined,
      });
    }
  }
  return out;
}

/** House mix for the padding records: mostly sleeves, some 7-inches and tapes. */
const HOUSE_KINDS: readonly RecordKind[] = ["lp", "lp", "single", "tape", "lp", "single", "lp", "tape"];
const HOUSE_ID = "house-";

/** A padding record, not one of the visitor's releases. */
export function isHouseRecord(spec: RecordSpec): boolean {
  return spec.id.startsWith(HOUSE_ID);
}

export interface SpecOptions {
  min?: number;
  max?: number;
}

/**
 * The records that drop: the visitor's releases first (up to `max`), padded
 * with house records to `min` so an empty crate still makes a scene.
 */
export function buildRecordSpecs(
  releases: CrateRelease[],
  { min = 12, max = 24 }: SpecOptions = {},
): RecordSpec[] {
  const count = Math.max(min, Math.min(max, releases.length));
  const specs: RecordSpec[] = [];
  for (let i = 0; i < count; i++) {
    const rel = releases[i];
    if (rel) {
      specs.push({
        id: rel.id,
        kind: kindForType(rel.type),
        color: paletteFor(rel.id),
        label: `${rel.artist} — ${rel.title}`,
      });
    } else {
      const kind = HOUSE_KINDS[i % HOUSE_KINDS.length];
      specs.push({
        id: `${HOUSE_ID}${i}`,
        kind,
        color: PALETTE_ORDER[i % PALETTE_ORDER.length],
        label: `${KIND_LABEL[kind]} ${String(i + 1).padStart(2, "0")}`,
      });
    }
  }
  return specs;
}

/**
 * Spec indices per kind, in crate order. Each kind is one instanced mesh, so
 * instance slot `j` of kind `k` is spec `groups[k][j]`.
 */
export function groupByKind(specs: readonly RecordSpec[]): Record<RecordKind, number[]> {
  const groups: Record<RecordKind, number[]> = { lp: [], single: [], tape: [] };
  specs.forEach((s, i) => groups[s.kind].push(i));
  return groups;
}

export interface Placement {
  position: Vec3;
  /** Euler XYZ, radians. */
  rotation: Vec3;
}

/** Interior half-extents and floor height, derived once from CRATE. */
export function crateInterior() {
  const [cx, cy, cz] = CRATE.position;
  return {
    cx,
    cz,
    halfX: CRATE.width / 2 - CRATE.wall,
    halfZ: CRATE.depth / 2 - CRATE.wall,
    floorY: cy + CRATE.floor,
  };
}

/** Lowest hold height: above the top of every frame, phone included. */
export const SPAWN_Y = 6.4;
/** Vertical gap between held records: two sleeves at the full hold tilt
 *  (±HOLD_TILT) still clear each other while they wait, weightless. */
export const SPAWN_STEP = 0.7;
export const HOLD_TILT = 0.45;
/** Seconds between releases — a cascade, not a dump. */
export const RELEASE_GAP = 0.06;

/**
 * Where each record is held before it drops. Sleeves aim inside the crate;
 * 7-inches and tapes aim wider so some bounce out onto the grid, which is
 * what a crate tipped full of records actually does.
 */
export function spawnLayout(specs: RecordSpec[], seed = 21): Placement[] {
  const rand = mulberry32(seed);
  const { cx, cz, halfX, halfZ } = crateInterior();
  return specs.map((spec, i) => {
    const spread =
      spec.kind === "lp"
        ? [halfX - RECORD_SIZE.lp[0] / 2 - 0.2, halfZ - RECORD_SIZE.lp[2] / 2 - 0.05]
        : [halfX + 0.6, halfZ + 0.55];
    return {
      position: [
        cx + (rand() * 2 - 1) * spread[0],
        SPAWN_Y + i * SPAWN_STEP,
        cz + (rand() * 2 - 1) * spread[1],
      ],
      rotation: [(rand() * 2 - 1) * HOLD_TILT, rand() * Math.PI * 2, (rand() * 2 - 1) * HOLD_TILT],
    };
  });
}

/** When record `i` is let go, in seconds after the physics world is ready. */
export function releaseTime(i: number): number {
  return i * RELEASE_GAP;
}

/** Widest footprint radius of anything laid on the floor (a tape, any yaw). */
const FLOOR_RADIUS = Math.max(
  RECORD_SIZE.single[0] / 2,
  Math.hypot(RECORD_SIZE.tape[0], RECORD_SIZE.tape[2]) / 2,
);
/** Jitter on floor spots, so the still scene looks dropped, not displayed. */
const FLOOR_JITTER = 0.05;
/** Centre-to-centre spacing that keeps two floor records apart, jitter included. */
const SLOT_PITCH = FLOOR_RADIUS * 2 + FLOOR_JITTER * 2 + 0.06;

/** Floor spots around the crate for 7-inches and tapes, nearest the camera first. */
function floorSlots(): Array<[number, number]> {
  const { cx, cz } = crateInterior();
  const clear = FLOOR_RADIUS + FLOOR_JITTER + 0.1;
  const front = cz + CRATE.depth / 2 + clear;
  const side = CRATE.width / 2 + clear;
  const p = SLOT_PITCH;
  return [
    [cx - p, front],
    [cx, front],
    [cx + p, front],
    [cx - 2 * p, front],
    [cx + 2 * p, front],
    [cx + side, cz + p / 2],
    [cx - side, cz + p / 2],
    [cx + side, cz - p / 2],
    [cx - side, cz - p / 2],
  ];
}

/** Largest yaw jitter for a stacked sleeve; the stack maths assumes it. */
export const STACK_YAW = 0.15;

/**
 * Where everything ends up when there is no drop (reduced motion): sleeves in
 * two piles inside the crate, 7-inches and tapes laid out on the grid around
 * it, and any overflow on top of the piles — a crate after the dig, still.
 */
export function restLayout(specs: RecordSpec[], seed = 5): Placement[] {
  const rand = mulberry32(seed);
  const { cx, cz, halfX, floorY } = crateInterior();
  const pileX = [cx - halfX / 2, cx + halfX / 2];
  const pileTop = [floorY, floorY];
  const slots = floorSlots();
  let slot = 0;
  let pile = 0;

  const onPile = (kind: RecordKind): Placement => {
    const p = pile++ % 2;
    const h = RECORD_SIZE[kind][1];
    const y = pileTop[p] + h / 2;
    pileTop[p] += h;
    return {
      position: [pileX[p] + (rand() - 0.5) * 0.06, y, cz + (rand() - 0.5) * 0.06],
      rotation: [0, (rand() * 2 - 1) * STACK_YAW, 0],
    };
  };

  return specs.map((spec) => {
    if (spec.kind === "lp") return onPile("lp");
    if (slot < slots.length) {
      const [x, z] = slots[slot++];
      const h = RECORD_SIZE[spec.kind][1];
      return {
        position: [
          x + (rand() * 2 - 1) * FLOOR_JITTER,
          FLOOR_Y + h / 2,
          z + (rand() * 2 - 1) * FLOOR_JITTER,
        ],
        rotation: [0, (rand() * 2 - 1) * 0.6, 0],
      };
    }
    return onPile(spec.kind);
  });
}
