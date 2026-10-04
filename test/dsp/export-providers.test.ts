import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Release } from "@/lib/types";

/**
 * The export providers driven end to end against fake service APIs.
 *
 * What these pin: every provider finds tracks BEFORE creating a playlist (the
 * old order left empty "Made with Pulsar" playlists on the user's account when
 * nothing matched), a crate with no matches creates nothing and says why,
 * Spotify batches adds at its 100-per-request cap, YouTube searches in the
 * Music category and keeps a partial playlist when quota dies mid-build, and
 * Apple verifies the artist and expands albums.
 */

const rel = (artist: string, title: string, type: Release["type"] = "single"): Release =>
  ({
    id: `${artist}-${title}`,
    artist,
    title,
    type,
    artwork_url: "",
    release_date: "2024-01-01",
    genre: null,
    tags: [],
    mood: null,
    spotify: null,
    apple_music: null,
    tidal: null,
    soundcloud: null,
    youtube_music: null,
    boomplay: null,
    created_at: "2024-01-01T00:00:00Z",
    curator_note: null,
  }) as Release;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = { method: string; url: string; body: unknown };

/** Route fetches by URL pattern; record every call in order. */
function fakeFetch(routes: [RegExp, (url: string, init?: RequestInit) => Response | Promise<Response>][]) {
  const calls: Call[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init?.method ?? "GET", url, body });
    for (const [re, h] of routes) if (re.test(url)) return h(url, init);
    return json({ error: "unrouted" }, 404);
  });
  return { calls, spy };
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
describe("Spotify", () => {
  async function provider() {
    const { saveToken } = await import("@/lib/dsp/shared");
    saveToken("spotify", "tok", 3600);
    localStorage.setItem("pulsar_spotify_scopes", "playlist-modify-public playlist-modify-private user-read-private");
    const m = await import("@/lib/dsp/spotify");
    m.setSpotifyClientId("cid");
    return m.spotifyProvider;
  }

  it("searches, then creates with POST /me/playlists, then adds via /items", async () => {
    const { calls } = fakeFetch([
      [/\/search\?/, () => json({ tracks: { items: [{ uri: "spotify:track:1", name: "Archangel", artists: [{ name: "Burial" }] }] } })],
      [/\/me\/playlists$/, () => json({ id: "pl", external_urls: { spotify: "https://open.spotify.com/playlist/pl" } }, 201)],
      [/\/playlists\/pl\/items$/, () => json({ snapshot_id: "s" }, 201)],
    ]);
    const p = await provider();
    const result = await p.createPlaylist("Night", [rel("Burial", "Archangel")]);
    const steps = calls.map((c) =>
      /\/search/.test(c.url) ? "search" : /\/me\/playlists$/.test(c.url) ? "create" : /\/items$/.test(c.url) ? "add" : c.url
    );
    expect(steps).toEqual(["search", "create", "add"]);
    expect(calls.some((c) => /\/users\//.test(c.url) || /\/tracks$/.test(c.url))).toBe(false);
    expect(result).toMatchObject({ trackCount: 1, addedReleases: 1, url: "https://open.spotify.com/playlist/pl" });
  });

  it("falls back to the pre-2026 endpoints only when the new ones 404", async () => {
    const { calls } = fakeFetch([
      [/\/search\?/, () => json({ tracks: { items: [{ uri: "spotify:track:1", name: "Archangel", artists: [{ name: "Burial" }] }] } })],
      [/\/me\/playlists$/, () => json({ error: "nope" }, 404)],
      [/\/v1\/me$/, () => json({ id: "u1" })],
      [/\/users\/u1\/playlists/, () => json({ id: "pl", external_urls: { spotify: "x" } }, 201)],
      [/\/playlists\/pl\/items$/, () => json({ error: "nope" }, 404)],
      [/\/playlists\/pl\/tracks$/, () => json({}, 201)],
    ]);
    const p = await provider();
    const result = await p.createPlaylist("Night", [rel("Burial", "Archangel")]);
    expect(calls.some((c) => /\/playlists\/pl\/tracks$/.test(c.url))).toBe(true);
    expect(result).toMatchObject({ trackCount: 1 });
  });

  it("creates nothing, and says why, when no record matches", async () => {
    const { calls } = fakeFetch([
      [/\/search\?/, () => json({ tracks: { items: [{ uri: "spotify:track:x", name: "Archangel", artists: [{ name: "Someone Else" }] }] }, albums: { items: [] } })],
    ]);
    const p = await provider();
    await expect(p.createPlaylist("Night", [rel("Burial", "Archangel")])).rejects.toThrow(/could be found on Spotify/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("doesn't substitute another album by the same artist", async () => {
    // The old code took the artist's first album when the title didn't match.
    fakeFetch([
      [/type=album/, () => json({ albums: { items: [{ id: "other", name: "Kindred EP", artists: [{ name: "Burial" }] }] } })],
      [/type=track/, () => json({ tracks: { items: [] } })],
    ]);
    const p = await provider();
    await expect(p.createPlaylist("Night", [rel("Burial", "Untrue", "album")])).rejects.toThrow(/could be found/);
  });

  it("matches a feed title with a store suffix", async () => {
    fakeFetch([
      [/type=album/, () => json({ albums: { items: [{ id: "al", name: "Love", artists: [{ name: "Burial" }] }] } })],
      [/\/albums\/al\/tracks/, () => json({ items: [{ uri: "spotify:track:1" }], next: null })],
      [/\/me\/playlists$/, () => json({ id: "pl", external_urls: { spotify: "x" } }, 201)],
      [/\/items$/, () => json({}, 201)],
    ]);
    const p = await provider();
    const result = await p.createPlaylist("Night", [rel("Burial", "Love - EP", "ep")]);
    expect(result).toMatchObject({ trackCount: 1 });
  });

  it("adds tracks in batches of at most 100, across paged album tracklists", async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => ({ uri: `spotify:track:${i}` }));
    const page2 = Array.from({ length: 50 }, (_, i) => ({ uri: `spotify:track:${50 + i}` }));
    const page3 = Array.from({ length: 30 }, (_, i) => ({ uri: `spotify:track:${100 + i}` }));
    const { calls } = fakeFetch([
      [/type=album/, () => json({ albums: { items: [{ id: "al", name: "Big", artists: [{ name: "Burial" }] }] } })],
      [/\/albums\/al\/tracks\?limit=50$/, () => json({ items: page1, next: "https://api.spotify.com/v1/albums/al/tracks?offset=50&limit=50" })],
      [/offset=50/, () => json({ items: page2, next: "https://api.spotify.com/v1/albums/al/tracks?offset=100&limit=50" })],
      [/offset=100/, () => json({ items: page3, next: null })],
      [/\/me\/playlists$/, () => json({ id: "pl", external_urls: { spotify: "x" } }, 201)],
      [/\/playlists\/pl\/items$/, () => json({}, 201)],
    ]);
    const p = await provider();
    const result = await p.createPlaylist("Big", [rel("Burial", "Big", "album")]);
    const adds = calls.filter((c) => /\/playlists\/pl\/items$/.test(c.url));
    expect(adds.map((a) => (a.body as { uris: string[] }).uris.length)).toEqual([100, 30]);
    expect(result).toMatchObject({ trackCount: 130 });
  });

  it("doesn't blame the allow-list for a 403 on adding tracks", async () => {
    fakeFetch([
      [/\/search\?/, () => json({ tracks: { items: [{ uri: "spotify:track:1", name: "Archangel", artists: [{ name: "Burial" }] }] } })],
      [/\/me\/playlists$/, () => json({ id: "pl", external_urls: { spotify: "x" } }, 201)],
      [/\/items$/, () => json({ error: "forbidden" }, 403)],
    ]);
    const p = await provider();
    const err = await p.createPlaylist("Night", [rel("Burial", "Archangel")]).catch((e) => e as Error);
    expect(String(err)).not.toMatch(/Users & Access/);
  });

  it("explains the allow-list when creating is refused", async () => {
    fakeFetch([
      [/\/search\?/, () => json({ tracks: { items: [{ uri: "spotify:track:1", name: "Archangel", artists: [{ name: "Burial" }] }] } })],
      [/\/me\/playlists$/, () => json({ error: "forbidden" }, 403)],
    ]);
    const p = await provider();
    await expect(p.createPlaylist("Night", [rel("Burial", "Archangel")])).rejects.toThrow(/approved/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("YouTube", () => {
  async function provider() {
    const { saveToken } = await import("@/lib/dsp/shared");
    saveToken("youtube", "tok", 3600);
    const m = await import("@/lib/dsp/youtube");
    m.setGoogleClientId("gid");
    return m.youtubeProvider;
  }

  it("searches the Music category, then creates, then inserts", async () => {
    const { calls } = fakeFetch([
      [/\/search\?/, () => json({ items: [{ id: { videoId: "v1" } }] })],
      [/\/playlists\?/, () => json({ id: "PL1" })],
      [/\/playlistItems\?/, () => json({ id: "it" })],
    ]);
    const p = await provider();
    const result = await p.createPlaylist("Night", [rel("Burial", "Archangel")]);
    const search = calls.find((c) => /\/search\?/.test(c.url))!;
    expect(search.url).toContain("videoCategoryId=10");
    const order = calls.map((c) => (/\/search/.test(c.url) ? "search" : /\/playlists\?/.test(c.url) ? "create" : "insert"));
    expect(order).toEqual(["search", "create", "insert"]);
    expect(result).toMatchObject({ trackCount: 1, url: "https://music.youtube.com/playlist?list=PL1" });
  });

  it("keeps the playlist and reports it when the quota runs out mid-build", async () => {
    let inserts = 0;
    let searches = 0;
    fakeFetch([
      [/\/search\?/, () => json({ items: [{ id: { videoId: `v${++searches}` } }] })],
      [/\/playlists\?/, () => json({ id: "PL1" })],
      [/\/playlistItems\?/, () =>
        ++inserts === 1
          ? json({ id: "ok" })
          : json({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403)],
    ]);
    const p = await provider();
    const result = await p.createPlaylist("Night", [rel("A", "One"), rel("B", "Two"), rel("C", "Three")]);
    expect(result).toMatchObject({ trackCount: 1, url: "https://music.youtube.com/playlist?list=PL1" });
    expect((result as { note?: string }).note).toMatch(/Stopped after 1 of 3/);
  });

  it("creates nothing when no video is found", async () => {
    const { calls } = fakeFetch([[/\/search\?/, () => json({ items: [] })]]);
    const p = await provider();
    await expect(p.createPlaylist("Night", [rel("A", "One")])).rejects.toThrow(/could be found on YouTube/);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Apple Music", () => {
  function fakeMusicKit(opts: { authorizeFails?: boolean } = {}) {
    const instance = {
      developerToken: "dev",
      musicUserToken: "",
      storefrontId: "us",
      authorize: vi.fn(async () => {
        if (opts.authorizeFails) throw new Error("popup blocked");
        instance.musicUserToken = "user";
      }),
    };
    (window as unknown as { MusicKit: unknown }).MusicKit = {
      configure: vi.fn(async () => {}),
      getInstance: () => instance,
    };
    return instance;
  }

  async function provider() {
    const m = await import("@/lib/dsp/apple");
    m.setAppleEnabled(true);
    return m.appleProvider;
  }

  it("verifies the artist and expands albums to their tracklist", async () => {
    fakeMusicKit();
    const { calls } = fakeFetch([
      [/\/api\/apple-token/, () => json({ token: "dev" })],
      [/types=albums/, () => json({ results: { albums: { data: [
        { id: "wrong", attributes: { artistName: "Tribute Band" } },
        { id: "al1", attributes: { artistName: "Burial" } },
      ] } } })],
      [/\/albums\/al1\/tracks/, () => json({ data: [{ id: "s1", type: "songs" }, { id: "s2", type: "songs" }] })],
      [/\/me\/library\/playlists/, () => json({ data: [{ id: "p.1" }] }, 201)],
    ]);
    const p = await provider();
    const result = await p.createPlaylist("Night", [rel("Burial", "Untrue", "album")]);
    const create = calls.find((c) => /library\/playlists/.test(c.url))!;
    const ids = (create.body as { relationships: { tracks: { data: { id: string }[] } } }).relationships.tracks.data.map((d) => d.id);
    expect(ids).toEqual(["s1", "s2"]);
    expect(result).toMatchObject({ trackCount: 2, url: "https://music.apple.com/library/playlist/p.1" });
  });

  it("says so when the sign-in popup is blocked, instead of a bare failure", async () => {
    fakeMusicKit({ authorizeFails: true });
    fakeFetch([[/\/api\/apple-token/, () => json({ token: "dev" })]]);
    const p = await provider();
    await expect(p.createPlaylist("Night", [rel("Burial", "Archangel")])).rejects.toThrow(/Allow pop-ups/);
  });

  it("creates nothing when no song matches the artist", async () => {
    fakeMusicKit();
    const { calls } = fakeFetch([
      [/\/api\/apple-token/, () => json({ token: "dev" })],
      [/types=songs/, () => json({ results: { songs: { data: [{ id: "x", attributes: { artistName: "Someone Else" } }] } } })],
    ]);
    const p = await provider();
    await expect(p.createPlaylist("Night", [rel("Burial", "Archangel")])).rejects.toThrow(/could be found on Apple Music/);
    expect(calls.some((c) => /library\/playlists/.test(c.url))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("readiness", () => {
  it("doesn't offer a service the server can't finish (YouTube without its secret)", async () => {
    fakeFetch([
      [/\/api\/dsp-config/, () => json({
        spotifyClientId: "s", googleClientId: "g", tidalClientId: "", appleEnabled: false,
        missing: { spotify: [], youtube_music: ["GOOGLE_CLIENT_SECRET"], tidal: ["TIDAL_CLIENT_ID"], apple_music: ["APPLE_TEAM_ID"] },
      })],
    ]);
    const dsp = await import("@/lib/dsp");
    await dsp.ensureDspConfig(true);
    expect(dsp.providerConfigured("spotify")).toBe(true);
    expect(dsp.providerConfigured("youtube_music")).toBe(false);
    expect(dsp.providerMissing("youtube_music")).toEqual(["GOOGLE_CLIENT_SECRET"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("TIDAL (v2 JSON:API)", () => {
  async function provider() {
    const { saveToken } = await import("@/lib/dsp/shared");
    saveToken("tidal", "tok", 3600);
    localStorage.setItem("pulsar_tidal_scopes", "playlists.write playlists.read collection.read user.read search.read");
    const m = await import("@/lib/dsp/tidal");
    m.setTidalClientId("tid");
    return m.tidalProvider;
  }

  /** A search response shaped like v2: hits under data[0].relationships, nodes in included. */
  const searchResponse = (kind: "tracks" | "albums", hits: { id: string; title: string }[]) =>
    json({
      data: [{ id: "q", type: "searchResults", relationships: { [kind]: { data: hits.map((h) => ({ id: h.id, type: kind })) } } }],
      included: hits.map((h) => ({ id: h.id, type: kind, attributes: { title: h.title } })),
    });

  it("searches with filter[query], verifies the artist via relationships, then creates and adds", async () => {
    const { calls } = fakeFetch([
      [/\/searchResults\?filter%5Bquery%5D=|\/searchResults\?filter\[query\]=/, () =>
        searchResponse("tracks", [{ id: "t-wrong", title: "Archangel" }, { id: "t1", title: "Archangel" }])],
      [/\/tracks\?filter/, () =>
        json({
          data: [
            { id: "t-wrong", type: "tracks", relationships: { artists: { data: [{ id: "a9", type: "artists" }] } } },
            { id: "t1", type: "tracks", relationships: { artists: { data: [{ id: "a1", type: "artists" }] } } },
          ],
          included: [
            { id: "a9", type: "artists", attributes: { name: "Tribute Band" } },
            { id: "a1", type: "artists", attributes: { name: "Burial" } },
          ],
        })],
      [/\/playlists$/, () => json({ data: { id: "pl1", type: "playlists" } }, 201)],
      [/\/playlists\/pl1\/relationships\/items/, () => new Response(null, { status: 204 })],
    ]);
    const p = await provider();
    const result = await p.createPlaylist("Night", [rel("Burial", "Archangel")]);
    expect(calls.some((c) => /\/searchResults\//.test(c.url))).toBe(false); // the retired path form
    const add = calls.find((c) => /relationships\/items/.test(c.url))!;
    expect((add.body as { data: { id: string }[] }).data.map((d) => d.id)).toEqual(["t1"]);
    expect(result).toMatchObject({ trackCount: 1, url: "https://tidal.com/playlist/pl1" });
  });

  it("reports a broken search as a failure, not as 'nothing found'", async () => {
    fakeFetch([[/\/searchResults/, () => json({ errors: [{ code: "INVALID_RESOURCE_ID", detail: "bad id" }] }, 400)]]);
    const p = await provider();
    await expect(p.createPlaylist("Night", [rel("Burial", "Archangel")])).rejects.toThrow(/TIDAL search failed/);
  });
});
