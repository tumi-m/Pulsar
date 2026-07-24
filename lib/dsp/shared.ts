/**
 * Shared primitives for the DSP playlist-creation providers.
 *
 * Each provider (Spotify, YouTube, Apple Music, …) implements the `DspProvider`
 * interface. The registry in ./index.ts routes a crate export to the right one.
 * Providers that use a redirect-based OAuth flow stash a `Pending` crate and
 * resume after the round-trip via `handleDspRedirect()`.
 */

import type { Release } from "../types";

export interface BuildResult {
  provider: string; // provider key (matches PlatformDef.key)
  url: string; // link to the created playlist
  name: string;
  addedReleases: number; // releases that matched at least one track
  totalReleases: number;
  trackCount: number; // tracks actually added
}

export interface Pending {
  provider: string;
  name: string;
  releases: Release[];
}

export type ProgressFn = (done: number, total: number) => void;

export interface DspProvider {
  key: string;
  label: string;
  /** true when the app has the public config needed to attempt real creation */
  configured(): boolean;
  /** Create (or resume creating) the playlist. Returns "redirecting" if it
   *  navigated to a consent screen — the build resumes after the round-trip. */
  createPlaylist(name: string, releases: Release[], onProgress?: ProgressFn): Promise<BuildResult | "redirecting">;
  /** For redirect-based providers: if the current URL carries this provider's
   *  OAuth response, finish the token exchange, clean the URL, return true. */
  completeRedirect?(): Promise<boolean>;
}

// ── PKCE helpers (Spotify, Tidal) ───────────────────────────────
export function randomString(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ("0" + (b & 0xff).toString(16)).slice(-2)).join("");
}

export async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
}

export function base64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function redirectUri(): string {
  // OAuth providers require an exact match; we register the site origin + "/".
  return `${window.location.origin}/`;
}

// ── Token storage (per provider) ────────────────────────────────
export interface StoredToken {
  access_token: string;
  expires_at: number; // epoch ms
}

export function saveToken(provider: string, access_token: string, expiresInSec: number) {
  const token: StoredToken = { access_token, expires_at: Date.now() + expiresInSec * 1000 };
  localStorage.setItem(`pulsar_dsp_token_${provider}`, JSON.stringify(token));
}

export function readToken(provider: string): StoredToken | null {
  try {
    const raw = localStorage.getItem(`pulsar_dsp_token_${provider}`);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    if (!t.access_token || Date.now() > t.expires_at - 30_000) return null;
    return t;
  } catch {
    return null;
  }
}

export function clearToken(provider: string) {
  localStorage.removeItem(`pulsar_dsp_token_${provider}`);
}

// ── Pending crate (survives the OAuth redirect) ─────────────────
const PENDING_KEY = "pulsar_dsp_pending";

export function savePending(p: Pending) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
}

export function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

export function clearPending() {
  sessionStorage.removeItem(PENDING_KEY);
}

/** Strip an OAuth query/hash response from the URL bar. */
export function cleanUrl() {
  const url = new URL(window.location.href);
  ["code", "state", "error"].forEach((k) => url.searchParams.delete(k));
  url.hash = "";
  window.history.replaceState({}, "", url.toString());
}

/** Normalise "artist — title" for a search query. */
export function searchTerm(r: Release): string {
  const clean = (s: string) => s.replace(/["']/g, "").trim();
  return `${clean(r.artist)} ${clean(r.title)}`;
}
