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
      if (Array.isArray(arr) && arr.length) return arr as Crate[];
    }
  } catch {
    /* fall through to migration */
  }
  // First run: migrate the legacy single playlist into a default crate.
  const legacy = read(PLAY_KEY);
  return [{ id: "default", name: "My Crate", releases: legacy }];
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
  const target = crates[0];
  return toggleInCrate(target.id, release);
}

/** Remove a release from every crate. */
export function removeFromPlaylist(id: string): void {
  const crates = readCrates();
  for (const c of crates) c.releases = c.releases.filter((r) => r.id !== id);
  writeCrates(crates);
}
