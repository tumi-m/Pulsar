/**
 * Pulsar — Collection (favorites + playlist)
 *
 * Lightweight localStorage store for the floating dock: a heart list
 * (favorites) and a single playlist. Rendered as a physical-media
 * bundle — a crate of vinyls, a CD binder, a stack of floppies.
 */

import type { Release } from "./types";

const FAV_KEY = "pulsar_favorites_v1";
const PLAY_KEY = "pulsar_playlist_v1";

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

export const getFavorites = () => read(FAV_KEY);
export const getPlaylist = () => read(PLAY_KEY);

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

export function inPlaylist(id: string): boolean {
  return read(PLAY_KEY).some((r) => r.id === id);
}

export function togglePlaylist(release: Release): boolean {
  const list = read(PLAY_KEY);
  const idx = list.findIndex((r) => r.id === release.id);
  if (idx >= 0) {
    list.splice(idx, 1);
    write(PLAY_KEY, list);
    return false;
  }
  list.unshift(release);
  write(PLAY_KEY, list);
  return true;
}

export function removeFromPlaylist(id: string): void {
  write(PLAY_KEY, read(PLAY_KEY).filter((r) => r.id !== id));
}
