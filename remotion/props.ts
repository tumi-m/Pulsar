import type { CalculateMetadataFunction } from "remotion";
import {
  ACCENTS,
  CARD_EXIT_SECONDS,
  INTRO_SECONDS,
  MAX_RECORDS,
  OUTRO_SECONDS,
  PER_RECORD_SECONDS,
  RECAP_FPS,
} from "./tokens";

/**
 * Crate Recap — input props and the pure logic around them.
 *
 * Plain types rather than a zod schema on purpose: the app is on zod 3 and
 * Remotion's schema tooling wants zod 4, and these props arrive from three
 * callers we control (the app, the CLI sample JSON, Studio defaults). What
 * they need is normalising, not validating — a crate from localStorage can
 * hold a record with no artist, a 300-character title or 80 releases, and the
 * video should still come out right.
 */

export type RecapRecord = {
  title: string;
  artist: string;
  artworkUrl?: string | null;
  /** Tried when artworkUrl fails, before the generated cassette (the app's chain). */
  artworkFallbackUrl?: string | null;
  year?: string | null;
};

export type CrateRecapProps = {
  crateName: string;
  records: RecapRecord[];
  withAudio?: boolean;
  /** How many records the crate really holds, when more than fit the video. */
  totalRecords?: number;
};

/** What the composition actually draws: every field present and bounded. */
export type NormalizedRecord = {
  title: string;
  artist: string;
  artworkUrl: string | null;
  artworkFallbackUrl: string | null;
  year: string | null;
};

export type NormalizedRecapProps = {
  crateName: string;
  records: NormalizedRecord[];
  withAudio: boolean;
  totalRecords: number;
};

const CRATE_NAME_MAX = 48;
// Bounds on the data, not the layout: what fits on a card is decided by
// fit.ts, which cuts at a word. These only stop a 3,000-character field from
// costing the layout pass anything.
export const TITLE_MAX = 100;
export const ARTIST_MAX = 100;

/** Collapse whitespace and cut to `max` characters, ending on an ellipsis. */
export function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** "2024-11-22", "2024" or "Released 1999" → "2024" / "1999". Anything else → null. */
export function yearOf(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const m = /(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(String(value));
  return m ? m[1] : null;
}

function artworkOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  // Only things an <img> can load. An empty string or a bare word would make
  // Remotion's <Img> fail and cost the card its fallback cover anyway.
  return /^(https?:\/\/|\/|data:image\/|blob:)/.test(url) ? url : null;
}

export function normalizeRecapProps(input: Partial<CrateRecapProps> | null | undefined): NormalizedRecapProps {
  const raw = Array.isArray(input?.records) ? input.records : [];
  const usable = raw
    .filter((r): r is RecapRecord => Boolean(r) && typeof r === "object")
    .map((r) => ({
      title: clip(r.title, TITLE_MAX),
      artist: clip(r.artist, ARTIST_MAX),
      artworkUrl: artworkOf(r.artworkUrl),
      artworkFallbackUrl: artworkOf(r.artworkFallbackUrl),
      year: yearOf(r.year),
    }))
    // A record with neither a title nor an artist has nothing to put on a card.
    .filter((r) => r.title || r.artist)
    .map((r) => ({ ...r, title: r.title || "Untitled", artist: r.artist || "Unknown artist" }));

  const given = input?.totalRecords;
  const totalRecords =
    typeof given === "number" && Number.isFinite(given) && given >= usable.length ? Math.floor(given) : usable.length;

  return {
    crateName: clip(input?.crateName, CRATE_NAME_MAX) || "Untitled crate",
    records: usable.slice(0, MAX_RECORDS),
    withAudio: input?.withAudio === true,
    totalRecords,
  };
}

/* ── timeline ──────────────────────────────────────────────────── */

export type RecapTimeline = {
  intro: number;
  perRecord: number;
  outro: number;
  /** Frames a card stays up into the next slot while the next one lands on it. */
  cardExit: number;
  recordCount: number;
  outroStart: number;
  total: number;
};

export function recapTimeline(recordCount: number, fps: number = RECAP_FPS): RecapTimeline {
  const n = Math.max(0, Math.min(MAX_RECORDS, Math.floor(Number.isFinite(recordCount) ? recordCount : 0)));
  const intro = Math.round(INTRO_SECONDS * fps);
  const perRecord = Math.round(PER_RECORD_SECONDS * fps);
  const outro = Math.round(OUTRO_SECONDS * fps);
  const outroStart = intro + n * perRecord;
  return {
    intro,
    perRecord,
    outro,
    cardExit: Math.round(CARD_EXIT_SECONDS * fps),
    recordCount: n,
    outroStart,
    total: outroStart + outro,
  };
}

export function recapDurationInFrames(recordCount: number, fps: number = RECAP_FPS): number {
  return recapTimeline(recordCount, fps).total;
}

/** Which record the header's counter shows at `frame` (1-based), or 0 outside the records. */
export function recordIndexAt(frame: number, t: RecapTimeline): number {
  if (t.recordCount === 0 || frame < t.intro || frame >= t.outroStart) return 0;
  return Math.min(t.recordCount, Math.floor((frame - t.intro) / t.perRecord) + 1);
}

export const calculateCrateRecapMetadata: CalculateMetadataFunction<CrateRecapProps> = ({ props }) => {
  const normalized = normalizeRecapProps(props);
  return {
    durationInFrames: recapDurationInFrames(normalized.records.length, RECAP_FPS),
    fps: RECAP_FPS,
    props: normalized,
    defaultOutName: `crate-recap-${slugify(normalized.crateName)}`,
  };
};

/* ── look ──────────────────────────────────────────────────────── */

/** Stable 32-bit hash: the same record gets the same cover in every render. */
export function hashString(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * The J-card stripe for a record, seeded on the artist exactly as the app's
 * cassette fallback is (jcardAccent(artist.toLowerCase()) in
 * components/Artwork.tsx), so a coverless record is the same tape in the
 * video as in the crate panel — and an artist's records share a stripe.
 */
export function accentFor(artist: string): string {
  return ACCENTS[hashString(artist.toLowerCase()) % ACCENTS.length];
}

/**
 * The cover's diagonal band: never the stripe's colour, and varied by title
 * so two records by one artist are still two different tapes.
 */
export function secondaryAccentFor(artist: string, title: string): string {
  const first = hashString(artist.toLowerCase()) % ACCENTS.length;
  const offset = 1 + (hashString(title.toLowerCase()) % (ACCENTS.length - 1));
  return ACCENTS[(first + offset) % ACCENTS.length];
}

/**
 * The big initial on a generated cover: the artist's first character, as the
 * app's J-card prints it (artist.charAt(0).toUpperCase()) — but a whole code
 * point, so an emoji or astral letter isn't cut in half.
 */
export function initialOf(name: string): string {
  const first = [...name.trim()][0];
  return first ? first.toUpperCase() : "♪";
}

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "crate"
  );
}

/* ── reels ─────────────────────────────────────────────────────── */

/** Tape pack radius as a fraction of the reel, full and nearly empty. */
export const REEL_FULL = 0.96;
export const REEL_EMPTY = 0.6;

/** How wound a reel is at `progress` (0–1): the supply reel empties, the take-up fills. */
export function reelPack(progress: number, reel: "supply" | "takeup"): number {
  const p = Math.min(1, Math.max(0, progress));
  return reel === "supply" ? REEL_FULL - (REEL_FULL - REEL_EMPTY) * p : REEL_EMPTY + (REEL_FULL - REEL_EMPTY) * p;
}

/**
 * Rotation of a deck reel at `frame`, in degrees.
 *
 * Tape crosses the heads at a constant speed, so a reel's angular speed is
 * inversely proportional to how much tape is on it: the emptying supply reel
 * speeds up while the filling take-up reel slows — the thing that makes a
 * real deck look real. Integrated frame by frame (at most ~700 steps) so the
 * reels also spin up at the start and coast to a stop at the end, like
 * pressing PLAY and then STOP, without ever jumping backwards.
 */
export function reelAngle(frame: number, total: number, fps: number, reel: "supply" | "takeup"): number {
  const spinUp = Math.max(1, Math.round(0.35 * fps));
  const coast = Math.max(1, Math.round(0.9 * fps));
  // At a full pack the supply reel turns about half a revolution a second.
  const base = (180 / fps) * REEL_FULL;
  const end = Math.min(Math.max(0, Math.floor(frame)), Math.max(0, total));
  let angle = 0;
  for (let f = 0; f < end; f++) {
    const up = Math.min(1, f / spinUp);
    // The motor cuts and friction slows the reels evenly, to rest on the last frame.
    const down = Math.min(1, Math.max(0, (total - 1 - f) / coast));
    angle += (base / reelPack(f / Math.max(1, total), reel)) * up * down;
  }
  return angle;
}
