/**
 * Real Spotify playlist creation — the "killer feature".
 *
 * Uses the Authorization Code + PKCE flow, which needs no client secret and is
 * therefore safe to run entirely in the browser. All you supply is a public
 * client id (`NEXT_PUBLIC_SPOTIFY_CLIENT_ID`) from a Spotify app whose Redirect
 * URI is set to this site's origin (e.g. https://pulsar-ten-sigma.vercel.app/).
 *
 * Flow:
 *   1. exportCrateToSpotify() stashes the crate, then redirects to Spotify's
 *      consent screen (beginAuth).
 *   2. On return, the app boots, sees `?code=` and finishes the token exchange
 *      (handleSpotifyRedirect), then resumes the pending crate build.
 *   3. buildPlaylist() creates a private playlist and fills it — for each saved
 *      release it finds the matching Spotify album and adds all of its tracks
 *      (falling back to a single-track match), so a crate of albums/singles
 *      becomes a real, playable playlist.
 */

import type { Release } from "./types";

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const SCOPES = "playlist-modify-public playlist-modify-private";
const TOKEN_KEY = "pulsar_spotify_token_v1";
const VERIFIER_KEY = "pulsar_spotify_verifier";
const PENDING_KEY = "pulsar_spotify_pending";

export function spotifyConfigured(): boolean {
  return CLIENT_ID.length > 0;
}

function redirectUri(): string {
  // Spotify requires an exact match; register the site origin + "/".
  return `${window.location.origin}/`;
}

// ── PKCE helpers ────────────────────────────────────────────────
function randomString(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ("0" + (b & 0xff).toString(16)).slice(-2)).join("");
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
}

function base64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ── Token storage ───────────────────────────────────────────────
interface StoredToken {
  access_token: string;
  expires_at: number; // epoch ms
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    if (!t.access_token || Date.now() > t.expires_at - 30_000) return null;
    return t;
  } catch {
    return null;
  }
}

export function spotifyConnected(): boolean {
  return readToken() != null;
}

export function disconnectSpotify() {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Step 1: kick off consent ────────────────────────────────────
async function beginAuth() {
  const verifier = randomString(48);
  const challenge = base64url(await sha256(verifier));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// ── Step 2: finish the exchange on return ───────────────────────
async function exchangeCode(code: string): Promise<StoredToken | null> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) return null;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const data = await res.json();
  const token: StoredToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  sessionStorage.removeItem(VERIFIER_KEY);
  return token;
}

// ── Spotify API helpers ─────────────────────────────────────────
async function api(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    disconnectSpotify();
    throw new Error("Spotify session expired — reconnect to continue.");
  }
  if (!res.ok) throw new Error(`Spotify API ${res.status}`);
  return res.status === 204 ? null : res.json();
}

/** Resolve one saved release to a list of Spotify track URIs. */
async function urisForRelease(r: Release, token: string): Promise<string[]> {
  const clean = (s: string) => s.replace(/["']/g, "").trim();
  // Prefer matching the whole album/single so every track lands in the crate.
  const albumQ = encodeURIComponent(`album:${clean(r.title)} artist:${clean(r.artist)}`);
  try {
    const found = await api(`/search?q=${albumQ}&type=album&limit=1`, token);
    const album = found?.albums?.items?.[0];
    if (album?.id) {
      const tracks = await api(`/albums/${album.id}/tracks?limit=50`, token);
      const uris = (tracks?.items ?? []).map((t: { uri: string }) => t.uri).filter(Boolean);
      if (uris.length) return uris;
    }
  } catch {
    /* fall through to a single-track match */
  }
  // Fallback: treat the release title as a track title.
  const trackQ = encodeURIComponent(`track:${clean(r.title)} artist:${clean(r.artist)}`);
  try {
    const found = await api(`/search?q=${trackQ}&type=track&limit=1`, token);
    const uri = found?.tracks?.items?.[0]?.uri;
    return uri ? [uri] : [];
  } catch {
    return [];
  }
}

export interface BuildResult {
  url: string;
  name: string;
  addedReleases: number;
  totalReleases: number;
  trackCount: number;
}

/**
 * Create a private playlist on the connected account and fill it from the crate.
 * `onProgress(done, total)` fires as each release resolves.
 */
export async function buildPlaylist(
  name: string,
  releases: Release[],
  onProgress?: (done: number, total: number) => void
): Promise<BuildResult> {
  const token = readToken();
  if (!token) throw new Error("Not connected to Spotify.");

  const me = await api("/me", token.access_token);
  const playlist = await api(`/users/${me.id}/playlists`, token.access_token, {
    method: "POST",
    body: JSON.stringify({
      name,
      public: false,
      description: "Made with Pulsar — pulsar music discovery.",
    }),
  });

  const allUris: string[] = [];
  let addedReleases = 0;
  for (let i = 0; i < releases.length; i++) {
    const uris = await urisForRelease(releases[i], token.access_token);
    if (uris.length) addedReleases++;
    allUris.push(...uris);
    onProgress?.(i + 1, releases.length);
  }

  // Add in batches of 100 (Spotify's per-request cap).
  for (let i = 0; i < allUris.length; i += 100) {
    await api(`/playlists/${playlist.id}/tracks`, token.access_token, {
      method: "POST",
      body: JSON.stringify({ uris: allUris.slice(i, i + 100) }),
    });
  }

  return {
    url: playlist.external_urls?.spotify ?? "https://open.spotify.com",
    name,
    addedReleases,
    totalReleases: releases.length,
    trackCount: allUris.length,
  };
}

// ── Public entry points ─────────────────────────────────────────

interface Pending {
  name: string;
  releases: Release[];
}

/**
 * Export a crate to Spotify. If already connected, builds immediately; otherwise
 * stashes the crate and redirects to consent, resuming after the round-trip.
 */
export async function exportCrateToSpotify(
  name: string,
  releases: Release[],
  onProgress?: (done: number, total: number) => void
): Promise<BuildResult | "redirecting"> {
  if (spotifyConnected()) {
    return buildPlaylist(name, releases, onProgress);
  }
  const pending: Pending = { name, releases };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  await beginAuth();
  return "redirecting";
}

/**
 * Called once on app boot. If we came back from Spotify's consent screen,
 * finishes the token exchange, cleans the URL, and returns the pending crate
 * (if any) so the caller can resume building the playlist.
 */
export async function handleSpotifyRedirect(): Promise<Pending | null> {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return null;

  // Clean the query string regardless of outcome.
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", url.toString());

  const token = await exchangeCode(code);
  if (!token) return null;

  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_KEY);
  try {
    return JSON.parse(raw) as Pending;
  } catch {
    return null;
  }
}
