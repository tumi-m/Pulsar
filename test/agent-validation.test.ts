import { describe, it, expect } from "vitest";
import { z } from "zod";

// Mirror of the schema in agent/tools.ts (kept local so the test doesn't pull
// the Anthropic SDK + Supabase graph). If the agent schema changes, update
// both — the contract is what matters: https-or-null on every URL.
const httpsUrl = z
  .string()
  .max(2048)
  .refine((s) => {
    try {
      return new URL(s).protocol === "https:";
    } catch {
      return false;
    }
  });

const agentReleaseSchema = z.object({
  artist: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  type: z.enum(["single", "album", "ep"]),
  artwork_url: httpsUrl,
  release_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  spotify: httpsUrl.nullable().optional(),
  apple_music: httpsUrl.nullable().optional(),
  tidal: httpsUrl.nullable().optional(),
  soundcloud: httpsUrl.nullable().optional(),
  youtube_music: httpsUrl.nullable().optional(),
  boomplay: httpsUrl.nullable().optional(),
  curator_note: z.string().trim().max(600).optional(),
});

const base = {
  artist: "James Blake",
  title: "Paper Envelope",
  type: "single",
  artwork_url: "https://i.scdn.co/image/abc",
  release_date: "2026-03-26",
  spotify: "https://open.spotify.com/track/abc",
  apple_music: "https://music.apple.com/album/x",
  tidal: null,
  soundcloud: null,
  youtube_music: null,
  boomplay: null,
};

describe("agentReleaseSchema", () => {
  it("accepts a well-formed release", () => {
    expect(agentReleaseSchema.safeParse(base).success).toBe(true);
  });

  it("rejects javascript: URIs on any link", () => {
    for (const field of ["spotify", "apple_music", "tidal", "soundcloud", "youtube_music"]) {
      const bad = { ...base, [field]: "javascript:alert(1)" };
      expect(agentReleaseSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("rejects data: URIs", () => {
    const bad = { ...base, artwork_url: "data:image/svg+xml,<svg/>" };
    expect(agentReleaseSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-https artwork", () => {
    expect(
      agentReleaseSchema.safeParse({ ...base, artwork_url: "http://i.scdn.co/a.jpg" }).success
    ).toBe(false);
  });

  it("rejects malformed release dates", () => {
    for (const d of ["2026-03-26T00:00:00Z", "26-03-2026", "yesterday", ""]) {
      expect(agentReleaseSchema.safeParse({ ...base, release_date: d }).success).toBe(false);
    }
  });

  it("rejects oversized fields", () => {
    expect(
      agentReleaseSchema.safeParse({ ...base, artist: "x".repeat(201) }).success
    ).toBe(false);
    expect(
      agentReleaseSchema.safeParse({ ...base, curator_note: "x".repeat(601) }).success
    ).toBe(false);
  });

  it("rejects unknown release types", () => {
    expect(agentReleaseSchema.safeParse({ ...base, type: "mixtape" }).success).toBe(false);
  });

  it("allows null links", () => {
    expect(
      agentReleaseSchema.safeParse({ ...base, spotify: null, apple_music: null }).success
    ).toBe(true);
  });
});