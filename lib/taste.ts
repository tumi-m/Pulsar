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
  return score;
}

/**
 * Tile size per release: 2 = favorite (2x2), 1 = liked (2x1), 0 = normal.
 * Sizes are rationed so the grid keeps its rhythm (~1 in 9 large,
 * ~1 in 7 wide).
 */
export function tileSizes(releases: Release[], profile: TasteProfile | null): number[] {
  if (!profile) {
    // No profile yet: neutral rhythm — a large tile every 11.
    return releases.map((_, i) => (i % 11 === 0 ? 2 : 0));
  }
  const scored = releases.map((r, i) => ({ i, s: scoreRelease(r, profile) }));
  const ranked = [...scored].sort((a, b) => b.s - a.s);
  const bigCount = Math.max(4, Math.floor(releases.length / 9));
  const wideCount = Math.max(6, Math.floor(releases.length / 7));
  const sizes = new Array(releases.length).fill(0);
  ranked.slice(0, bigCount).forEach(({ i, s }) => {
    if (s > 0) sizes[i] = 2;
  });
  ranked.slice(bigCount, bigCount + wideCount).forEach(({ i, s }) => {
    if (s > 0) sizes[i] = 1;
  });
  return sizes;
}
