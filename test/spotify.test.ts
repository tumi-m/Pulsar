import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { artistMatches, urisForRelease } from "@/lib/dsp/spotify";
import type { Release } from "@/lib/types";

const release = (artist: string, title: string, type: Release["type"]): Release =>
  ({
    id: "x",
    artist,
    title,
    type,
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
  }) as Release;

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("artistMatches", () => {
  it("matches an exact artist name", () => {
    expect(artistMatches("Burna Boy", [{ name: "Burna Boy" }])).toBe(true);
  });
  it("returns false for a different artist", () => {
    expect(artistMatches("Burna Boy", [{ name: "Someone Else" }])).toBe(false);
  });
  it("returns false for empty / undefined credits", () => {
    expect(artistMatches("Burna Boy", [])).toBe(false);
    expect(artistMatches("Burna Boy", undefined)).toBe(false);
    expect(artistMatches("Burna Boy", [{ name: "" }])).toBe(false);
  });
  it("strips parentheticals and punctuation before comparing", () => {
    // "Queen (Band)" normalises to "queen"
    expect(artistMatches("Queen", [{ name: "Queen (Band)" }])).toBe(true);
  });
  it("matches when the credit is a substring (featured / '&')", () => {
    expect(artistMatches("Burna Boy", [{ name: "Burna Boy & Another" }])).toBe(true);
  });
  it("matches when the wanted name is a superset of the credit", () => {
    expect(artistMatches("Burna Boy Official", [{ name: "Burna Boy" }])).toBe(true);
  });
});

describe("urisForRelease", () => {
  it("expands an album to its full tracklist when the album matches", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/albums/") && u.includes("/tracks"))
        return json({ items: [{ uri: "spotify:track:t1" }, { uri: "spotify:track:t2" }] });
      if (u.includes("type=album"))
        return json({
          albums: { items: [{ id: "alb1", name: "Love, Damini", artists: [{ name: "Burna Boy" }] }] },
        });
      return json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const uris = await urisForRelease(release("Burna Boy", "Love, Damini", "album"), "tok");
    expect(uris).toEqual(["spotify:track:t1", "spotify:track:t2"]);
  });

  it("falls back to a single track for a single", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("type=track"))
        return json({ tracks: { items: [{ uri: "spotify:track:s1", artists: [{ name: "Burna Boy" }] }] } });
      return json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const uris = await urisForRelease(release("Burna Boy", "Last Last", "single"), "tok");
    expect(uris).toEqual(["spotify:track:s1"]);
  });

  it("falls through album→track when no album matches", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("type=album")) return json({ albums: { items: [] } });
      if (u.includes("type=track"))
        return json({ tracks: { items: [{ uri: "spotify:track:f1", artists: [{ name: "Burna Boy" }] }] } });
      return json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const uris = await urisForRelease(release("Burna Boy", "Mystery", "album"), "tok");
    expect(uris).toEqual(["spotify:track:f1"]);
  });

  it("returns [] when nothing matches at all", async () => {
    const fetchMock = vi.fn(async () => json({ tracks: { items: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    const uris = await urisForRelease(release("Nobody", "Nothing", "single"), "tok");
    expect(uris).toEqual([]);
  });

  it("retries on a 429 then succeeds", async () => {
    let albumCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("type=album")) {
        albumCalls++;
        if (albumCalls === 1)
          return new Response(null, { status: 429, headers: { "Retry-After": "1" } });
        return json({
          albums: { items: [{ id: "alb1", name: "Love, Damini", artists: [{ name: "Burna Boy" }] }] },
        });
      }
      if (u.includes("/albums/") && u.includes("/tracks"))
        return json({ items: [{ uri: "spotify:track:t1" }] });
      return json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const uris = await urisForRelease(release("Burna Boy", "Love, Damini", "album"), "tok");
    expect(uris).toEqual(["spotify:track:t1"]);
    expect(albumCalls).toBe(2); // retried once after the 429
  });

  it("propagates a 401 (expired session) as a rejection", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(urisForRelease(release("Burna Boy", "Love, Damini", "album"), "tok")).rejects.toThrow(
      /expired/i,
    );
  });

  it("propagates a 403 as a rejection", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(urisForRelease(release("Burna Boy", "Love, Damini", "album"), "tok")).rejects.toThrow(
      /403/,
    );
  });
});