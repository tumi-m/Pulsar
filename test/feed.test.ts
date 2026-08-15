import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { stableId, mapDeezer, getLiveFeed } from "@/lib/feed";
import type { Release } from "@/lib/types";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("stableId", () => {
  it("is deterministic and case-insensitive", () => {
    expect(stableId("Burna Boy", "Album")).toBe(stableId("burna boy", "album"));
  });
  it("starts with the feed- prefix", () => {
    expect(stableId("A", "B").startsWith("feed-")).toBe(true);
  });
  it("distinguishes different titles by the same artist", () => {
    expect(stableId("A", "B")).not.toBe(stableId("A", "C"));
  });
  it("distinguishes swapped artist/title", () => {
    expect(stableId("A", "B")).not.toBe(stableId("B", "A"));
  });
  it("is collision-resistant across a batch of distinct inputs", () => {
    const inputs: [string, string][] = [];
    for (let i = 0; i < 200; i++) inputs.push([`Artist ${i}`, `Title ${i}`]);
    const ids = new Set(inputs.map(([a, t]) => stableId(a, t)));
    expect(ids.size).toBe(inputs.length);
  });
});

describe("mapDeezer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("maps a full album with a real date", () => {
    const r = mapDeezer(
      { id: 5, title: "  Album ", artist: { name: "  Burna Boy " }, cover_xl: "art", release_date: "2026-01-02", record_type: "album" },
      150,
    );
    expect(r).not.toBeNull();
    expect(r!.artist).toBe("Burna Boy");
    expect(r!.title).toBe("Album");
    expect(r!.type).toBe("album");
    expect(r!.artwork_url).toBe("art");
    expect(r!.release_date).toBe("2026-01-02");
    expect(r!.popularity).toBe(150);
    expect(r!._dz).toBe(5);
    expect(r!._noDate).toBeFalsy();
  });

  it("maps record_type single / ep / fallback album", () => {
    expect(mapDeezer({ title: "t", artist: { name: "x" }, cover_big: "a", record_type: "single" }, null)!.type).toBe("single");
    expect(mapDeezer({ title: "t", artist: { name: "x" }, cover_big: "a", record_type: "ep" }, null)!.type).toBe("ep");
    expect(mapDeezer({ title: "t", artist: { name: "x" }, cover_big: "a" }, null)!.type).toBe("album");
  });

  it("flags missing/invalid dates as _noDate and stamps today", () => {
    const r = mapDeezer({ id: 7, title: "t", artist: { name: "x" }, cover_big: "a" }, null)!;
    expect(r._noDate).toBe(true);
    expect(r._dz).toBe(7);
    expect(r.release_date).toBe("2026-07-28");
  });

  it("returns null when artist, title or artwork is missing", () => {
    expect(mapDeezer({ title: "t", cover_big: "a" }, null)).toBeNull();
    expect(mapDeezer({ artist: { name: "x" }, cover_big: "a" }, null)).toBeNull();
    expect(mapDeezer({ title: "t", artist: { name: "x" } }, null)).toBeNull();
  });
});

describe("getLiveFeed — dedup / merge / Apple ranking / enrich", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        // Apple most-played (albums + songs). Feed order IS the chart.
        if (u.includes("applemarketingtools.com")) {
          if (u.includes("albums.json")) {
            return json({
              feed: {
                results: [
                  { artistName: "Solange", name: "When I Get Home", artworkUrl100: "https://ex/a/100x100bb.jpg", kind: "album", releaseDate: "2026-07-20", genres: [{ name: "Music" }, { name: "Pop" }], url: "https://music.apple.com/1" },
                  { artistName: "Kendrick Lamar", name: "Not Like Us", artworkUrl100: "https://ex/b/100x100bb.jpg", kind: "song", releaseDate: "2026-07-22", genres: [{ name: "Hip-Hop/Rap" }] },
                ],
              },
            });
          }
          return json({ feed: { results: [] } }); // songs feed empty
        }
        if (u.includes("deezer.com/editorial/0/releases")) {
          return json({
            data: [
              { id: 42, title: "Deezer Exclusive", artist: { name: "Burna Boy" }, cover_xl: "https://ex/c.jpg", release_date: "2026-07-19", record_type: "album" },
              { id: 77, title: "Undated Single", artist: { name: "Tyla" }, cover_big: "https://ex/d.jpg", record_type: "single" },
            ],
          });
        }
        if (u.includes("deezer.com/chart/0/albums")) {
          // Same album as the editorial copy, chart position 1 → popularity 200.
          return json({ data: [{ id: 42, title: "Deezer Exclusive", artist: { name: "Burna Boy" }, cover_xl: "https://ex/c.jpg", release_date: "2026-07-19" }] });
        }
        if (u.includes("deezer.com/genre")) {
          // Only id 0 (filtered out) → genre / genre-artist sweeps fetch nothing.
          return json({ data: [{ id: 0, name: "All" }] });
        }
        if (u.includes("deezer.com/album/77")) {
          // Back-fill the undated single with a real date + genre.
          return json({ release_date: "2026-07-15", genres: { data: [{ name: "Pop" }] } });
        }
        // Everything else (Africa/Gospel/Grammy searches, album detail for dated)
        // is left to fail → fetchJSON returns null → empty.
        return json({}, 404);
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("merges, dedups, ranks Apple per-feed, back-fills dates, sorts newest-first", async () => {
    const feed = await getLiveFeed();

    // 2 Apple + 2 Deezer (one Deezer album duplicates across editorial+chart → 1)
    expect(feed).toHaveLength(4);

    // Newest first by real date.
    expect(feed[0].title).toBe("Not Like Us"); // 2026-07-22
    expect(feed[1].title).toBe("When I Get Home"); // 2026-07-20
    expect(feed[2].title).toBe("Deezer Exclusive"); // 2026-07-19
    expect(feed[3].title).toBe("Undated Single"); // back-filled to 2026-07-15

    // Apple per-feed popularity: feed position 1 → 200, position 2 → 199.
    const solange = feed.find((r) => r.title === "When I Get Home")!;
    const kendrick = feed.find((r) => r.title === "Not Like Us")!;
    expect(solange.popularity).toBe(200);
    expect(kendrick.popularity).toBe(199);

    // Dedup kept the strongest chart signal for the Deezer duplicate.
    const burna = feed.find((r) => r.title === "Deezer Exclusive")!;
    expect(burna.popularity).toBe(200);

    // The undated single was back-filled from the album-detail endpoint
    // (otherwise it would carry today's date and sort to the top).
    expect(feed[3].release_date).toBe("2026-07-15");
    expect(feed[3].genre).toBe("Pop");

    // No internal bookkeeping fields leak to consumers.
    expect((feed[0] as unknown as Record<string, unknown>)._dz).toBeUndefined();
    expect((feed[0] as unknown as Record<string, unknown>)._noDate).toBeUndefined();
  });
});