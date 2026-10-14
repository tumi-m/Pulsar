/**
 * Pulsar — Collection
 *
 * localStorage store for the floating dock:
 *  • Favorites — a single "loved" list that just adds on.
 *  • Crates — MANY named crates (like playlists). A release can live in
 *    several crates; each is its own list you can build, browse and export.
 *
 * Backward-compatible shims (getPlaylist/inPlaylist/togglePlaylist/…) keep the
 * older single-playlist callers working — they operate across all crates, or
 * on the first ("active") crate.
 */

import type { Release } from "./types";

const FAV_KEY = "pulsar_favorites_v1";
const PLAY_KEY = "pulsar_playlist_v1"; // legacy single playlist (migrated once)
const CRATES_KEY = "pulsar_crates_v2";

export interface Crate {
  id: string;
  name: string;
  releases: Release[];
}

function read(key: string): Release[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(key: string, list: Release[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent("pulsar-collection-change"));
  } catch {
    /* noop */
  }
}

// ── Favorites (single list) ──────────────────────────────────────
export const getFavorites = () => read(FAV_KEY);

export function isFavorite(id: string): boolean {
  return read(FAV_KEY).some((r) => r.id === id);
}

export function toggleFavorite(release: Release): boolean {
  const list = read(FAV_KEY);
  const idx = list.findIndex((r) => r.id === release.id);
  if (idx >= 0) {
    list.splice(idx, 1);
    write(FAV_KEY, list);
    return false;
  }
  list.unshift(release);
  write(FAV_KEY, list);
  return true;
}

// ── Crates (many named lists) ────────────────────────────────────
let idSeq = 0;
function newId(): string {
  idSeq += 1;
  return `crate-${Date.now().toString(36)}-${idSeq.toString(36)}`;
}

function readCrates(): Crate[] {
  try {
    const raw = localStorage.getItem(CRATES_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr as Crate[];
      // An explicitly-invalid value (not an array) falls through to migration;
      // an EMPTY array is returned as-is — it means the user deleted their
      // crates, and re-running the legacy migration would resurrect them.
    } else {
      // No v2 key at all: first run — migrate the legacy single playlist into
      // a default crate and PERSIST it so this runs exactly once.
      const legacy = read(PLAY_KEY);
      const migrated: Crate[] = [{ id: "default", name: "My Crate", releases: legacy }];
      try {
        localStorage.setItem(CRATES_KEY, JSON.stringify(migrated));
      } catch {
        /* storage full/blocked — migration stays in-memory, harmless */
      }
      return migrated;
    }
  } catch {
    /* fall through to default */
  }
  // Unparsable v2 value: don't resurrect legacy data over a corrupted real
  // crate list — return the default crate and let the next write repair it.
  return [{ id: "default", name: "My Crate", releases: [] }];
}

function writeCrates(crates: Crate[]): void {
  try {
    localStorage.setItem(CRATES_KEY, JSON.stringify(crates));
    window.dispatchEvent(new CustomEvent("pulsar-collection-change"));
  } catch {
    /* noop */
  }
}

export function getCrates(): Crate[] {
  return readCrates();
}

export function createCrate(name: string): Crate {
  const crates = readCrates();
  const crate: Crate = { id: newId(), name: (name || "").trim() || "New Crate", releases: [] };
  crates.push(crate);
  writeCrates(crates);
  return crate;
}

export function renameCrate(id: string, name: string): void {
  const crates = readCrates();
  const c = crates.find((x) => x.id === id);
  if (c) {
    c.name = (name || "").trim() || c.name;
    writeCrates(crates);
  }
}

export function deleteCrate(id: string): void {
  const crates = readCrates().filter((c) => c.id !== id);
  writeCrates(crates.length ? crates : [{ id: "default", name: "My Crate", releases: [] }]);
}

export function inCrate(crateId: string, releaseId: string): boolean {
  return readCrates().find((c) => c.id === crateId)?.releases.some((r) => r.id === releaseId) ?? false;
}

/** Is this release saved in ANY crate? (drives the tile "in crate" indicator) */
export function inAnyCrate(releaseId: string): boolean {
  return readCrates().some((c) => c.releases.some((r) => r.id === releaseId));
}

/** Which crates contain this release. */
export function cratesWith(releaseId: string): string[] {
  return readCrates().filter((c) => c.releases.some((r) => r.id === releaseId)).map((c) => c.id);
}

export function toggleInCrate(crateId: string, release: Release): boolean {
  const crates = readCrates();
  const crate = crates.find((c) => c.id === crateId);
  if (!crate) return false;
  const idx = crate.releases.findIndex((r) => r.id === release.id);
  if (idx >= 0) {
    crate.releases.splice(idx, 1);
    writeCrates(crates);
    return false;
  }
  crate.releases.unshift(release);
  writeCrates(crates);
  return true;
}

export function removeFromCrate(crateId: string, releaseId: string): void {
  const crates = readCrates();
  const crate = crates.find((c) => c.id === crateId);
  if (crate) {
    crate.releases = crate.releases.filter((r) => r.id !== releaseId);
    writeCrates(crates);
  }
}

// ── Backward-compatible playlist shims ───────────────────────────
/** All releases across every crate (deduped) — used by the recommender. */
export function getPlaylist(): Release[] {
  const seen = new Set<string>();
  const out: Release[] = [];
  for (const c of readCrates()) {
    for (const r of c.releases) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        out.push(r);
      }
    }
  }
  return out;
}

export const inPlaylist = (id: string) => inAnyCrate(id);

/** Toggle in the first ("active") crate — the quick one-tap crate action. */
export function togglePlaylist(release: Release): boolean {
  const crates = readCrates();
  // Zero crates is a legitimate state (the user deleted them all, or a sync
  // pull emptied the list). `crates[0].id` then threw, so the one-tap add —
  // and the Selector's "add all to crate" — died silently. Make one instead.
  const target = crates[0] ?? createCrate("My Crate");
  return toggleInCrate(target.id, release);
}

/** Remove a release from every crate. */
export function removeFromPlaylist(id: string): void {
  const crates = readCrates();
  for (const c of crates) c.releases = c.releases.filter((r) => r.id !== id);
  writeCrates(crates);
}


/**
 * Combine the local collection with the one pulled from the server on sign-in.
 *
 * SyncBridge used to write the remote copy straight over localStorage — "if
 * they have one, it becomes local truth". But pullCollection returns a remote
 * copy as soon as ANY favourite exists, and crates were never reaching the
 * server (see lib/sync.ts), so the remote copy's crate list was always empty:
 * signing in deleted every crate on the device, the one thing the feature
 * exists to protect. Even with sync working, anything saved while signed out
 * would have been thrown away.
 *
 * Nothing is ever removed here. Favourites are a union by release id; crates
 * match by name and take the union of their releases; crates that exist on
 * only one side are kept. Local order wins where both have an item.
 */
export function mergeCollections(
  local: { favorites: Release[]; crates: Crate[] },
  remote: { favorites: Release[]; crates: Crate[] }
): { favorites: Release[]; crates: Crate[] } {
  const unionById = (a: Release[], b: Release[]) => {
    const seen = new Set(a.map((r) => r.id));
    return [...a, ...b.filter((r) => !seen.has(r.id))];
  };

  const crates: Crate[] = local.crates.map((c) => ({ ...c, releases: [...c.releases] }));
  for (const rc of remote.crates) {
    const match = crates.find((c) => c.name.trim().toLowerCase() === rc.name.trim().toLowerCase());
    if (match) match.releases = unionById(match.releases, rc.releases);
    else crates.push({ ...rc, releases: [...rc.releases] });
  }
  return { favorites: unionById(local.favorites, remote.favorites), crates };
}
