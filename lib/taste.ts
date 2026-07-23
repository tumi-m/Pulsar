/**
 * Pulsar — Taste Profile
 *
 * Built from the 4-question visual onboarding quiz. Each answer adds
 * weight to genre buckets and moods; the grid then sizes tiles by how
 * strongly a release matches the profile (favorites render larger).
 */

import type { Release, MoodTag } from "./types";
import { genreBucket, type GenreBucket } from "./utils";

export interface TasteProfile {
  genres: Partial<Record<GenreBucket, number>>;
  moods: Partial<Record<MoodTag, number>>;
  /** Learned affinities from favorites + crate (recommender). */
  artists?: Record<string, number>;
  labels?: Record<string, number>;
  completedAt: string;
}

const STORAGE_KEY = "pulsar_taste_v1";

// ── Quiz definition ──────────────────────────────────────────────
// 4 questions. Every option is a GRAPHIC (CSS/SVG vibe card), no text
// descriptions — the label is only an accessibility name.

export interface QuizOption {
  id: string;
  label: string; // a11y only
  visual: "storm" | "ocean" | "vinyl" | "grid" | "night" | "sunrise" | "static" | "silk";
  genres: Partial<Record<GenreBucket, number>>;
  moods: Partial<Record<MoodTag, number>>;
}

export interface QuizQuestion {
  id: string;
  options: [QuizOption, QuizOption];
}

export const QUIZ: QuizQuestion[] = [
  {
    id: "energy",
    options: [
      {
        id: "storm",
        label: "Electric storm",
        visual: "storm",
        genres: { "Hip-Hop": 2, Metal: 2, Rock: 1, Electronic: 1 },
        moods: { energetic: 2, raw: 2 },
      },
      {
        id: "ocean",
        label: "Calm ocean",
        visual: "ocean",
        genres: { "Soul / R&B": 2, Jazz: 2, "Folk / Country": 1 },
        moods: { ambient: 2, tender: 2 },
      },
    ],
  },
  {
    id: "texture",
    options: [
      {
        id: "vinyl",
        label: "Warm analog vinyl",
        visual: "vinyl",
        genres: { "Soul / R&B": 2, Jazz: 1, Rock: 1, "Folk / Country": 1 },
        moods: { melancholic: 1, tender: 1 },
      },
      {
        id: "grid",
        label: "Neon digital grid",
        visual: "grid",
        genres: { Electronic: 3, Pop: 1, "Hip-Hop": 1 },
        moods: { hypnotic: 2, euphoric: 1 },
      },
    ],
  },
  {
    id: "hour",
    options: [
      {
        id: "night",
        label: "3am starfield",
        visual: "night",
        genres: { Electronic: 1, "Hip-Hop": 1, "Soul / R&B": 1 },
        moods: { hypnotic: 2, melancholic: 2, cinematic: 1 },
      },
      {
        id: "sunrise",
        label: "Golden sunrise",
        visual: "sunrise",
        genres: { Pop: 2, "Folk / Country": 1, Rock: 1 },
        moods: { euphoric: 2, tender: 1 },
      },
    ],
  },
  {
    id: "edge",
    options: [
      {
        id: "static",
        label: "Distorted static",
        visual: "static",
        genres: { Metal: 2, Rock: 2, Electronic: 1 },
        moods: { raw: 2, energetic: 1 },
      },
      {
        id: "silk",
        label: "Flowing silk",
        visual: "silk",
        genres: { "Soul / R&B": 2, Pop: 1, Jazz: 1 },
        moods: { tender: 2, cinematic: 1, ambient: 1 },
      },
    ],
  },
];

// ── Profile build / persistence ─────────────────────────────────

export function buildProfile(optionIds: string[]): TasteProfile {
  const profile: TasteProfile = {
    genres: {},
    moods: {},
    completedAt: new Date().toISOString(),
  };
  for (const q of QUIZ) {
    for (const opt of q.options) {
      if (!optionIds.includes(opt.id)) continue;
      for (const [g, w] of Object.entries(opt.genres)) {
        profile.genres[g as GenreBucket] = (profile.genres[g as GenreBucket] ?? 0) + (w ?? 0);
      }
      for (const [m, w] of Object.entries(opt.moods)) {
        profile.moods[m as MoodTag] = (profile.moods[m as MoodTag] ?? 0) + (w ?? 0);
      }
    }
  }
  return profile;
}

export function saveProfile(profile: TasteProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* private mode */
  }
}

export function loadProfile(): TasteProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object" || !p.genres || !p.moods) return null;
    return p as TasteProfile;
  } catch {
    return null;
  }
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

// ── Scoring ──────────────────────────────────────────────────────

/** How strongly a release matches the profile. 0 = no signal. */
export function scoreRelease(r: Release, profile: TasteProfile): number {
  let score = 0;
  const bucket = genreBucket(r.genre);
  if (bucket && profile.genres[bucket]) score += profile.genres[bucket]!;
  if (r.mood && profile.moods[r.mood]) score += profile.moods[r.mood]!;
  // Learned affinities — strong signal because they come from real actions.
  const a = profile.artists?.[r.artist.toLowerCase()];
  if (a) score += a * 4; // same artist you loved/crated → big boost
  const l = r.label ? profile.labels?.[r.label.toLowerCase()] : undefined;
  if (l) score += l * 2;
  return score;
}

/**
 * Recommender — fold the user's real actions (favorites + crate) into the
 * quiz profile so scoring aligns ever more closely with their inputs.
 * Each saved release reinforces its genre bucket, mood, artist and label.
 */
export function learnedProfile(
  base: TasteProfile | null,
  favorites: Release[],
  crate: Release[]
): TasteProfile | null {
  const collection = [...favorites, ...crate];
  if (!base && collection.length === 0) return base;

  const profile: TasteProfile = {
    genres: { ...(base?.genres ?? {}) },
    moods: { ...(base?.moods ?? {}) },
    artists: { ...(base?.artists ?? {}) },
    labels: { ...(base?.labels ?? {}) },
    completedAt: base?.completedAt ?? new Date(0).toISOString(),
  };

  const bump = <K extends string>(rec: Record<K, number>, key: K, w: number) => {
    rec[key] = (rec[key] ?? 0) + w;
  };

  for (const r of collection) {
    const b = genreBucket(r.genre);
    if (b) bump(profile.genres as Record<string, number>, b, 1);
    if (r.mood) bump(profile.moods as Record<string, number>, r.mood, 1);
    bump(profile.artists!, r.artist.toLowerCase(), 1);
    if (r.label) bump(profile.labels!, r.label.toLowerCase(), 1);
  }
  return profile;
}

/**
 * Tile size per release: 2 = favorite (2x2), 1 = liked (2x1), 0 = normal.
 * Sizes are rationed so the grid keeps its rhythm (~1 in 9 large,
 * ~1 in 7 wide).
 */
export function tileSizes(releases: Release[], profile: TasteProfile | null): number[] {
  const n = releases.length;
  const sizes = new Array(n).fill(0);
  if (n === 0) return sizes;

  // Stable pseudo-random from the index → a varied but non-jittery layout that
  // never collapses into a uniform grid of same-size tiles.
  const rnd = (i: number) => {
    const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  if (!profile) {
    // No taste yet — still mix big & wide tiles in a lively, irregular rhythm.
    for (let i = 0; i < n; i++) {
      const r = rnd(i);
      if (r > 0.9) sizes[i] = 2; // ~10% large squares
      else if (r > 0.72) sizes[i] = 1; // ~18% wide tiles
    }
    return sizes;
  }

  const scored = releases.map((r, i) => ({ i, s: scoreRelease(r, profile) }));
  const ranked = [...scored].sort((a, b) => b.s - a.s);
  const bigCount = Math.max(4, Math.floor(n / 9));
  const wideCount = Math.max(6, Math.floor(n / 7));
  ranked.slice(0, bigCount).forEach(({ i, s }) => {
    if (s > 0) sizes[i] = 2;
  });
  ranked.slice(bigCount, bigCount + wideCount).forEach(({ i, s }) => {
    if (s > 0) sizes[i] = 1;
  });
  // Sprinkle extra wide tiles across the rest so the grid keeps a dynamic,
  // mixed rhythm instead of a flat wall of equal squares.
  for (let i = 0; i < n; i++) {
    if (sizes[i] === 0 && rnd(i) > 0.88) sizes[i] = 1;
  }
  return sizes;
}
