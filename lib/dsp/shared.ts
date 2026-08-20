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

// ── Runtime DSP configuration ────────────────────────────────────
// NEXT_PUBLIC_* values are inlined at build time, so a client id set in the
// Vercel dashboard after the last deploy never reaches the browser — which
// showed up as Spotify's `INVALID_CLIENT` screen. The client therefore asks
// /api/dsp-config (which reads live server env) and overlays whatever it
// returns on top of the build-time values.
export interface DspRuntimeConfig {
  spotifyClientId: string;
  googleClientId: string;
  tidalClientId: string;
  appleEnabled: boolean;
}

const BUILD_TIME_CONFIG: DspRuntimeConfig = {
  spotifyClientId: process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "",
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  tidalClientId: process.env.NEXT_PUBLIC_TIDAL_CLIENT_ID ?? "",
  appleEnabled: process.env.NEXT_PUBLIC_APPLE_MUSIC_ENABLED === "true",
};

let configPromise: Promise<DspRuntimeConfig> | null = null;

/** Fetch the live DSP config once per session (force to re-check). */
export function loadDspConfig(force = false): Promise<DspRuntimeConfig> {
  if (typeof window === "undefined") return Promise.resolve(BUILD_TIME_CONFIG);
  if (!force && configPromise) return configPromise;
  configPromise = fetch("/api/dsp-config", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : BUILD_TIME_CONFIG))
    .then((c: Partial<DspRuntimeConfig>) => ({
      spotifyClientId: c.spotifyClientId || BUILD_TIME_CONFIG.spotifyClientId,
      googleClientId: c.googleClientId || BUILD_TIME_CONFIG.googleClientId,
      tidalClientId: c.tidalClientId || BUILD_TIME_CONFIG.tidalClientId,
      appleEnabled: c.appleEnabled ?? BUILD_TIME_CONFIG.appleEnabled,
    }))
    .catch(() => BUILD_TIME_CONFIG);
  return configPromise;
}

// ── OAuth failure messages (survive the redirect round-trip) ──────
// A failed consent/token exchange happens on a fresh page load, so the error
// is stashed in storage; the next createPlaylist() attempt surfaces it instead
// of silently bouncing the user back to the authorize screen forever.
const AUTH_ERROR_PREFIX = "pulsar_dsp_auth_error_";

export function setAuthError(provider: string, message: string) {
  try {
    sessionStorage.setItem(AUTH_ERROR_PREFIX + provider, message);
  } catch {
    /* ignore */
  }
}

/** Read-and-clear: an error should be shown exactly once. */
export function takeAuthError(provider: string): string | null {
  try {
    const v = sessionStorage.getItem(AUTH_ERROR_PREFIX + provider);
    if (v) sessionStorage.removeItem(AUTH_ERROR_PREFIX + provider);
    return v;
  } catch {
    return null;
  }
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

/**
 * Persist the crate across the OAuth redirect. Only the fields the providers
 * actually need are stored — a full Release[] can blow the storage quota on a
 * large crate, which used to make the whole export fail. Written to BOTH
 * session and local storage because some mobile browsers drop sessionStorage
 * across the round-trip.
 */
export function savePending(p: Pending) {
  const slim: Pending = {
    provider: p.provider,
    name: p.name,
    releases: p.releases.map(
      (r) => ({ id: r.id, artist: r.artist, title: r.title, type: r.type }) as Release
    ),
  };
  const raw = JSON.stringify(slim);
  try {
    sessionStorage.setItem(PENDING_KEY, raw);
  } catch {
    /* quota / disabled — the localStorage copy below is the fallback */
  }
  try {
    localStorage.setItem(PENDING_KEY, raw);
  } catch {
    /* ignore */
  }
}

export function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY) ?? localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

export function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
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
