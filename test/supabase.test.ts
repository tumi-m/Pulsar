import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanUrl, upsertPayload } from "@/lib/supabase";

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});

describe("cleanUrl", () => {
  const set = (v: string) => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = v;
  };

  it("returns '' when no URL is set", () => {
    expect(cleanUrl()).toBe("");
  });

  it("reduces a bare origin", () => {
    set("https://abcdefgh.supabase.co");
    expect(cleanUrl()).toBe("https://abcdefgh.supabase.co");
  });

  it("strips a trailing slash", () => {
    set("https://abcdefgh.supabase.co/");
    expect(cleanUrl()).toBe("https://abcdefgh.supabase.co");
  });

  it("strips the full /rest/v1/ REST endpoint", () => {
    set("https://abcdefgh.supabase.co/rest/v1/");
    expect(cleanUrl()).toBe("https://abcdefgh.supabase.co");
    set("https://abcdefgh.supabase.co/rest/v1/releases");
    expect(cleanUrl()).toBe("https://abcdefgh.supabase.co");
  });

  it("drops any path, query and trailing slash via URL parsing", () => {
    set("https://abcdefgh.supabase.co/some/path?x=1");
    expect(cleanUrl()).toBe("https://abcdefgh.supabase.co");
  });

  it("trims surrounding whitespace", () => {
    set("  https://abcdefgh.supabase.co  ");
    expect(cleanUrl()).toBe("https://abcdefgh.supabase.co");
  });

  it("falls back to regex trimming for an unparseable URL", () => {
    set("not a url at all");
    expect(cleanUrl()).toBe("not a url at all");
    set("https://example.supabase.co/rest/v1");
    // Still parseable → origin; the regex path is only for non-URLs.
    expect(cleanUrl()).toBe("https://example.supabase.co");
  });
});
describe("upsertPayload", () => {
  const base = {
    artist: "Burial",
    title: "Untrue",
    type: "album" as const,
    artwork_url: "https://example.test/a.jpg",
    release_date: "2007-11-05",
    spotify: null,
    apple_music: null,
    tidal: null,
    soundcloud: null,
    youtube_music: null,
  };

  it("omits enrichment fields entirely when this run produced none", () => {
    // PostgREST only writes the columns present, so an omitted key means
    // "keep what's stored". Writing null here wiped notes and descriptors
    // saved by an earlier run — enrichment could never accumulate.
    const p = upsertPayload({ ...base });
    expect("curator_note" in p).toBe(false);
    expect("mood" in p).toBe(false);
    expect("tags" in p).toBe(false);
  });

  it("writes enrichment when this run produced some", () => {
    const p = upsertPayload({
      ...base,
      curator_note: "Rain on a bus window at 3am.",
      mood: "melancholic",
      tags: ["late night", "crackling", "sparse"],
    });
    expect(p.curator_note).toBe("Rain on a bus window at 3am.");
    expect(p.mood).toBe("melancholic");
    expect(p.tags).toEqual(["late night", "crackling", "sparse"]);
  });

  it("treats an empty tag array as nothing to write", () => {
    expect("tags" in upsertPayload({ ...base, tags: [] })).toBe(false);
  });

  it("always writes the factual fields, so fresh feed data wins", () => {
    const p = upsertPayload({ ...base });
    expect(p.artist).toBe("Burial");
    expect(p.artwork_url).toBe("https://example.test/a.jpg");
    expect(p.release_date).toBe("2007-11-05");
    expect("boomplay" in p).toBe(true);
  });
});
