import { describe, it, expect, beforeEach } from "vitest";
import {
  buildProfile,
  scoreRelease,
  tileSizes,
  learnedProfile,
  QUIZ,
} from "@/lib/taste";
import type { Release } from "@/lib/types";
import type { TasteProfile } from "@/lib/taste";
import type { MoodTag } from "@/lib/types";

const release = (o: Partial<Release>): Release =>
  ({
    id: "x",
    artist: "x",
    title: "t",
    type: "album",
    artwork_url: "",
    release_date: "2026-01-01",
    genre: null,
    tags: [],
    mood: null,
    spotify: null,
    apple_music: null,
    tidal: null,
    soundcloud: null,
    youtube_music: null,
    created_at: "2026-01-01T00:00:00Z",
    curator_note: null,
    ...o,
  }) as Release;

beforeEach(() => localStorage.clear());

describe("buildProfile", () => {
  it("accumulates genre + mood weights from selected options", () => {
    // Pick one option per question: storm, grid, night, static.
    const p = buildProfile(["storm", "grid", "night", "static"]);
    expect(p.genres["Electronic"]).toBe(1 + 3 + 1 + 1); // storm1 + grid3 + night1 + static1
    expect(p.genres["Hip-Hop"]).toBe(2 + 1 + 1); // storm2 + grid1 + night1
    expect(p.moods["raw"]).toBe(2 + 2); // storm2 + static2
    expect(p.moods["hypnotic"]).toBe(2 + 2); // grid2 + night2
    expect(p.completedAt).toBeTruthy();
  });

  it("ignores option ids that are not in the quiz", () => {
    const p = buildProfile(["storm", "nonexistent"]);
    expect(p.genres["Metal"]).toBe(2); // only storm contributes
  });

  it("has 4 questions with 2 options each", () => {
    expect(QUIZ).toHaveLength(4);
    QUIZ.forEach((q) => expect(q.options).toHaveLength(2));
  });
});

describe("scoreRelease", () => {
  it("scores genre bucket + mood + artist (x4) + label (x2)", () => {
    const profile: TasteProfile = {
      genres: { "Hip-Hop": 2 },
      moods: { energetic: 3 } as Partial<Record<MoodTag, number>>,
      artists: { "burna boy": 1 },
      labels: { "sub pop": 2 },
      completedAt: "2026-01-01",
    };
    const r = release({ artist: "Burna Boy", genre: "Hip-Hop", mood: "energetic", label: "Sub Pop" });
    // 2 (genre) + 3 (mood) + 1*4 (artist) + 2*2 (label) = 13
    expect(scoreRelease(r, profile)).toBe(13);
  });

  it("returns 0 for no signal", () => {
    const profile: TasteProfile = { genres: {}, moods: {}, completedAt: "2026-01-01" };
    expect(scoreRelease(release({ artist: "Nobody", genre: "Jazz", mood: "ambient" }), profile)).toBe(0);
  });

  it("artist affinity is case-insensitive", () => {
    const profile: TasteProfile = {
      genres: {},
      moods: {},
      artists: { "kendrick lamar": 2 },
      completedAt: "2026-01-01",
    };
    expect(scoreRelease(release({ artist: "Kendrick Lamar" }), profile)).toBe(2 * 4);
  });
});

describe("tileSizes", () => {
  it("returns an empty array for no releases", () => {
    expect(tileSizes([], null)).toEqual([]);
  });

  it("returns one size per release, each in {0,1,2}", () => {
    const releases = Array.from({ length: 30 }, (_, i) => release({ id: String(i), artist: `A${i}` }));
    const sizes = tileSizes(releases, null);
    expect(sizes).toHaveLength(30);
    expect(new Set(sizes)).toMatchObject(expect.anything());
    sizes.forEach((s) => expect([0, 1, 2]).toContain(s));
  });

  it("is deterministic — same input, same output", () => {
    const releases = Array.from({ length: 20 }, (_, i) => release({ id: String(i), artist: `A${i}` }));
    expect(tileSizes(releases, null)).toEqual(tileSizes(releases, null));
  });

  it("with a profile, ranks highest-scored releases as large (2)", () => {
    const releases = Array.from({ length: 30 }, (_, i) =>
      release({ id: String(i), artist: i < 3 ? "Burna Boy" : `A${i}`, genre: i < 3 ? "Afrobeats" : "Classical" }),
    );
    const profile: TasteProfile = {
      genres: { Afrobeats: 5 },
      moods: {},
      artists: { "burna boy": 3 },
      completedAt: "2026-01-01",
    };
    const sizes = tileSizes(releases, profile);
    // The 3 strongly-matching Burna Boy releases should be large (2).
    const burnaLarge = releases
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.artist === "Burna Boy")
      .every((x) => sizes[x.i] === 2);
    expect(burnaLarge).toBe(true);
  });
});

describe("learnedProfile", () => {
  it("folds favorites + crate into the profile", () => {
    const learned = learnedProfile(
      null,
      [release({ artist: "Burna Boy", genre: "Afrobeats" })],
      [release({ artist: "Kendrick Lamar", genre: "Hip-Hop" })],
    );
    expect(learned).not.toBeNull();
    expect(learned!.artists!["burna boy"]).toBe(1);
    expect(learned!.artists!["kendrick lamar"]).toBe(1);
    expect(learned!.genres!["Afrobeats"]).toBe(1);
    expect(learned!.genres!["Hip-Hop"]).toBe(1);
  });

  it("preserves the base profile and adds to it", () => {
    const base: TasteProfile = {
      genres: { Afrobeats: 2 },
      moods: {},
      artists: { "burna boy": 1 },
      labels: {},
      completedAt: "2026-01-01",
    };
    const learned = learnedProfile(base, [release({ artist: "Burna Boy", genre: "Afrobeats" })], []);
    expect(learned!.genres!["Afrobeats"]).toBe(3); // 2 base + 1 learned
    expect(learned!.artists!["burna boy"]).toBe(2); // 1 base + 1 learned
  });

  it("returns the base when there is nothing to learn", () => {
    expect(learnedProfile(null, [], [])).toBeNull();
  });
});