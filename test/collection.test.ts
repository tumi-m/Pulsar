import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getCrates,
  createCrate,
  renameCrate,
  deleteCrate,
  toggleInCrate,
  inCrate,
  inAnyCrate,
  cratesWith,
  getFavorites,
  isFavorite,
  toggleFavorite,
  getPlaylist,
  inPlaylist,
  togglePlaylist,
  removeFromPlaylist,
  removeFromCrate,
  mergeCollections,
} from "@/lib/collection";
import type { Release } from "@/lib/types";

const r = (id: string): Release =>
  ({
    id,
    artist: `Artist ${id}`,
    title: `Title ${id}`,
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
  boomplay: null,
    created_at: "2026-01-01T00:00:00Z",
    curator_note: null,
  }) as Release;

beforeEach(() => {
  localStorage.clear();
});

describe("legacy migration", () => {
  it("migrates pulsar_playlist_v1 into a default crate on first run", () => {
    localStorage.setItem("pulsar_playlist_v1", JSON.stringify([r("1"), r("2")]));
    const crates = getCrates();
    expect(crates).toHaveLength(1);
    expect(crates[0].id).toBe("default");
    expect(crates[0].name).toBe("My Crate");
    expect(crates[0].releases).toHaveLength(2);
  });

  it("returns a default crate when nothing is stored", () => {
    const crates = getCrates();
    expect(crates).toHaveLength(1);
    expect(crates[0].id).toBe("default");
    expect(crates[0].releases).toEqual([]);
  });
});

describe("crate CRUD", () => {
  it("creates, renames and deletes crates", () => {
    const c = createCrate("Chill");
    expect(c.name).toBe("Chill");
    expect(getCrates()).toHaveLength(2); // default + new

    renameCrate(c.id, "  Late Night  ");
    expect(getCrates().find((x) => x.id === c.id)!.name).toBe("Late Night");

    renameCrate(c.id, "   "); // blank → keep existing
    expect(getCrates().find((x) => x.id === c.id)!.name).toBe("Late Night");

    deleteCrate(c.id);
    expect(getCrates().find((x) => x.id === c.id)).toBeUndefined();
  });

  it("never deletes the last crate — recreates a default", () => {
    deleteCrate("default");
    const crates = getCrates();
    expect(crates).toHaveLength(1);
    expect(crates[0].id).toBe("default");
  });

  it("toggles a release in/out of a crate and reports membership", () => {
    const c = createCrate("Vibes");
    expect(inCrate(c.id, "x")).toBe(false);
    expect(toggleInCrate(c.id, r("x"))).toBe(true); // added
    expect(inCrate(c.id, "x")).toBe(true);
    expect(inAnyCrate("x")).toBe(true);
    expect(cratesWith("x")).toContain(c.id);
    expect(toggleInCrate(c.id, r("x"))).toBe(false); // removed
    expect(inCrate(c.id, "x")).toBe(false);
    expect(inAnyCrate("x")).toBe(false);
  });

  it("toggleInCrate on a missing crate is a no-op false", () => {
    expect(toggleInCrate("nope", r("x"))).toBe(false);
  });

  it("removeFromCrate removes only from the named crate", () => {
    const a = createCrate("A");
    const b = createCrate("B");
    toggleInCrate(a.id, r("x"));
    toggleInCrate(b.id, r("x"));
    removeFromCrate(a.id, "x");
    expect(inCrate(a.id, "x")).toBe(false);
    expect(inCrate(b.id, "x")).toBe(true);
  });
});

describe("favorites", () => {
  it("toggles favorites and reports membership", () => {
    expect(isFavorite("1")).toBe(false);
    expect(toggleFavorite(r("1"))).toBe(true);
    expect(isFavorite("1")).toBe(true);
    expect(getFavorites()).toHaveLength(1);
    expect(toggleFavorite(r("1"))).toBe(false);
    expect(isFavorite("1")).toBe(false);
  });
});

describe("playlist shims", () => {
  it("getPlaylist dedupes across crates", () => {
    const a = createCrate("A");
    const b = createCrate("B");
    toggleInCrate(a.id, r("1"));
    toggleInCrate(b.id, r("1")); // same release in two crates
    toggleInCrate(a.id, r("2"));
    expect(getPlaylist()).toHaveLength(2);
    expect(inPlaylist("1")).toBe(true);
  });

  it("togglePlaylist toggles in the active (first) crate", () => {
    togglePlaylist(r("1"));
    expect(inCrate(getCrates()[0].id, "1")).toBe(true);
    togglePlaylist(r("1"));
    expect(inCrate(getCrates()[0].id, "1")).toBe(false);
  });

  it("removeFromPlaylist removes from every crate", () => {
    const a = createCrate("A");
    const b = createCrate("B");
    toggleInCrate(a.id, r("1"));
    toggleInCrate(b.id, r("1"));
    removeFromPlaylist("1");
    expect(inAnyCrate("1")).toBe(false);
  });
});

describe("collection-change event", () => {
  it("dispatches pulsar-collection-change on writes", () => {
    const handler = vi.fn();
    window.addEventListener("pulsar-collection-change", handler);
    toggleFavorite(r("1"));
    createCrate("X");
    toggleInCrate(getCrates()[0].id, r("2"));
    window.removeEventListener("pulsar-collection-change", handler);
    expect(handler.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe("an empty crate list is a state, not a crash", () => {
  it("togglePlaylist creates a crate when there are none", () => {
    localStorage.setItem("pulsar_crates_v2", "[]");
    expect(() => togglePlaylist(r("9"))).not.toThrow();
    const crates = getCrates();
    expect(crates).toHaveLength(1);
    expect(inCrate(crates[0].id, "9")).toBe(true);
  });
});

describe("mergeCollections — signing in never deletes anything", () => {
  const crate = (name: string, ids: string[]) => ({ id: `c-${name}`, name, releases: ids.map(r) });

  it("keeps every local crate when the server has favourites but no crates", () => {
    // Exactly the state crate sync left the server in: favourites uploaded,
    // crates rejected. Overwriting with this wiped the device.
    const merged = mergeCollections(
      { favorites: [r("1")], crates: [crate("Road trip", ["a", "b"]), crate("Late", ["c"])] },
      { favorites: [r("1"), r("2")], crates: [] }
    );
    expect(merged.crates.map((c) => c.name)).toEqual(["Road trip", "Late"]);
    expect(merged.crates[0].releases.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("unions favourites by id, local order first", () => {
    const merged = mergeCollections(
      { favorites: [r("2"), r("1")], crates: [] },
      { favorites: [r("1"), r("3")], crates: [] }
    );
    expect(merged.favorites.map((x) => x.id)).toEqual(["2", "1", "3"]);
  });

  it("merges crates with the same name (case-insensitively) and keeps one-sided crates", () => {
    const merged = mergeCollections(
      { favorites: [], crates: [crate("Road Trip", ["a"])] },
      { favorites: [], crates: [crate("road trip", ["a", "b"]), crate("Gym", ["g"])] }
    );
    expect(merged.crates).toHaveLength(2);
    expect(merged.crates[0].releases.map((x) => x.id)).toEqual(["a", "b"]);
    expect(merged.crates[1].name).toBe("Gym");
  });

  it("does not mutate either input", () => {
    const local = { favorites: [r("1")], crates: [crate("A", ["a"])] };
    const remote = { favorites: [r("2")], crates: [crate("A", ["b"])] };
    const snapshot = JSON.stringify({ local, remote });
    mergeCollections(local, remote);
    expect(JSON.stringify({ local, remote })).toBe(snapshot);
  });
});
