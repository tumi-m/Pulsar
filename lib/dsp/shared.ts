/**
 * Shared primitives for the DSP playlist-creation providers.
 *
 * Each provider (Spotify, YouTube, Apple Music, …) implements the `DspProvider`
 * interface. The registry in ./index.ts routes a crate export to the right one.
 * Providers that use a redirect-based OAuth flow stash a `Pending` crate and
 * resume after the round-trip via `handleDspRedirect()`.
 */

import type { Release } from "../types";
import { titleMatches } from "../match";

export interface BuildResult {
  provider: string; // provider key (matches PlatformDef.key)
  url: string; // link to the created playlist
  name: string;
  addedReleases: number; // releases that matched at least one track
  totalReleases: number;
  trackCount: number; // tracks actually added
  /** Set when the build stopped early but kept what it made (e.g. a quota ran out). */
  note?: string;
  /** "Artist — Title" for each record the service had no match for. */
  unmatched?: string[];
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
  /** Forget this service's sign-in so the next export asks again. */
  disconnect?(): void | Promise<void>;
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
  /**
   * Server settings each service still lacks, by provider key (names only).
   * null when unknown — the config request failed, or the build-time fallback
   * is in use — in which case nothing is held back on its account.
   */
  missing: Record<string, string[]> | null;
}

const BUILD_TIME_CONFIG: DspRuntimeConfig = {
  spotifyClientId: process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "",
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  tidalClientId: process.env.NEXT_PUBLIC_TIDAL_CLIENT_ID ?? "",
  appleEnabled: process.env.NEXT_PUBLIC_APPLE_MUSIC_ENABLED === "true",
  missing: null,
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
      missing: c.missing ?? null,
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

// ── OAuth state ─────────────────────────────────────────────────
// `state` used to be the provider's name — "spotify", "tidal", "youtube" — so
// it identified which flow was returning but carried no nonce: nothing tied a
// returning redirect to a sign-in THIS browser started (the CSRF protection
// `state` exists for). It is now "<provider>.<nonce>", with the nonce kept
// beside the PKCE verifier and checked, once, on return.
const STATE_PREFIX = "pulsar_oauth_state_";

export function newOAuthState(provider: string): string {
  const nonce = randomString(16);
  try {
    // Mirrored into localStorage for the same reason as the verifier: some
    // mobile browsers drop sessionStorage across the OAuth round-trip.
    sessionStorage.setItem(STATE_PREFIX + provider, nonce);
    localStorage.setItem(STATE_PREFIX + provider, nonce);
  } catch {
    /* storage unavailable — the check below then fails closed */
  }
  return `${provider}.${nonce}`;
}

/**
 * "other"    — this redirect isn't for `provider`; leave it alone.
 * "ok"       — ours, and the nonce matches the one we issued.
 * "mismatch" — claims to be ours but we didn't start it (or storage was lost).
 * The stored nonce is consumed either way.
 */
/** Did this browser start a sign-in with `provider` that never came back? */
export function hasOutstandingState(provider: string): boolean {
  try {
    return Boolean(sessionStorage.getItem(STATE_PREFIX + provider) ?? localStorage.getItem(STATE_PREFIX + provider));
  } catch {
    return false;
  }
}

/** Forget an outstanding sign-in nonce (an abandoned round-trip). */
export function dropState(provider: string): void {
  try {
    sessionStorage.removeItem(STATE_PREFIX + provider);
    localStorage.removeItem(STATE_PREFIX + provider);
  } catch {
    /* ignore */
  }
}

export function checkOAuthState(provider: string, state: string | null): "other" | "ok" | "mismatch" {
  if (!state || (state !== provider && !state.startsWith(provider + "."))) return "other";
  let expected: string | null = null;
  try {
    expected = sessionStorage.getItem(STATE_PREFIX + provider) ?? localStorage.getItem(STATE_PREFIX + provider);
    sessionStorage.removeItem(STATE_PREFIX + provider);
    localStorage.removeItem(STATE_PREFIX + provider);
  } catch {
    /* fall through to mismatch */
  }
  return expected && state === `${provider}.${expected}` ? "ok" : "mismatch";
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

/**
 * @param minValidityMs how long the token must still be good for. Exports ask
 *   for minutes, not the 30s default: a big crate takes longer than that to
 *   build, and a token expiring halfway lost the run at the add step.
 */
export function readToken(provider: string, minValidityMs = 30_000): StoredToken | null {
  try {
    const raw = localStorage.getItem(`pulsar_dsp_token_${provider}`);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    if (!t.access_token || Date.now() > t.expires_at - minValidityMs) return null;
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
      // clean_title survives the round-trip too: matching uses it, and dropping
      // it meant a resumed export searched for "Love - EP" instead of "Love".
      // artwork_url too: the resumed build — which every first export goes
      // through — showed its record animation with no covers at all.
      (r) =>
        ({
          id: r.id,
          artist: r.artist,
          title: r.title,
          clean_title: r.clean_title,
          type: r.type,
          artwork_url: r.artwork_url,
          // Direct catalogue links, when the release has them (see catalogId).
          spotify: r.spotify,
          apple_music: r.apple_music,
          tidal: r.tidal,
        }) as Release
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
/**
 * The title a streaming service will know the record by. Feed titles carry
 * store suffixes and credits — "Love - EP", "Song (feat. X)" — that the
 * services index without, and searching with them both lowers recall and
 * defeats title checks.
 */
export function plainTitle(r: Release): string {
  return (r.clean_title || r.title)
    .replace(/\s*[-–—]\s*(single|ep)\s*$/i, "")
    .replace(/\s*[([](feat\.?|ft\.?|featuring|with)\b[^)\]]*[)\]]/gi, "")
    .trim();
}

export function searchTerm(r: Release): string {
  const clean = (s: string) => s.replace(/["']/g, "").trim();
  return `${clean(r.artist)} ${clean(plainTitle(r))}`;
}

/** Is `got` the same record as this release? See lib/match.ts titleMatches. */
export function sameTitle(r: Release, got: string | undefined): boolean {
  return Boolean(got) && titleMatches(plainTitle(r), got!);
}


/** The last loaded config, for synchronous readers (the export sheet). */
let lastConfig: DspRuntimeConfig = BUILD_TIME_CONFIG;
let haveServerConfig = false;
/**
 * A refetch that fails falls back to the build-time values, which know nothing
 * about missing secrets. Applying that over a good server answer flipped
 * YouTube to "ready" without its secret, and Apple off, mid-session. Keep the
 * last server answer instead; use the fallback only if there never was one.
 */
export function rememberDspConfig(c: DspRuntimeConfig): DspRuntimeConfig {
  const fromServer = c.missing !== null;
  if (fromServer) {
    lastConfig = c;
    haveServerConfig = true;
  } else if (!haveServerConfig) {
    lastConfig = c;
  }
  return lastConfig;
}
/** Settings a provider still needs on the server, or [] when ready / unknown. */
export function missingConfig(provider: string): string[] {
  return lastConfig.missing?.[provider] ?? [];
}


/**
 * The client id a sign-in was STARTED with, kept beside the PKCE verifier.
 *
 * The token exchange on return used whatever CLIENT_ID the freshly loaded page
 * had — which comes from /api/dsp-config on that load. If that request failed,
 * the exchange posted client_id="" and the user was told their Client ID was
 * wrong. The exchange must use the same id as the authorize request anyway.
 */
export function rememberAuthClient(provider: string, clientId: string): void {
  try {
    sessionStorage.setItem(`pulsar_${provider}_auth_client`, clientId);
    localStorage.setItem(`pulsar_${provider}_auth_client`, clientId);
  } catch {
    /* storage unavailable */
  }
}
export function authClient(provider: string, fallback: string): string {
  try {
    return (
      sessionStorage.getItem(`pulsar_${provider}_auth_client`) ??
      localStorage.getItem(`pulsar_${provider}_auth_client`) ??
      fallback
    );
  } catch {
    return fallback;
  }
}


/**
 * The exact catalogue item a release already links to, if any.
 *
 * Chart records carry a direct Apple Music album link, and records saved
 * elsewhere can carry direct Spotify or TIDAL links — the export ignored them
 * all and searched again, which can only ever be as good as the search. Search
 * links (".../search?...") yield nothing here.
 */
export function catalogId(
  r: Release,
  provider: "spotify" | "apple_music" | "tidal"
): { kind: "album" | "track"; id: string } | null {
  const url = (r[provider] as string | null | undefined) ?? "";
  if (!url || /\/search\b|[?&](q|term)=/.test(url)) return null;
  if (provider === "spotify") {
    const m = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(album|track)\/([A-Za-z0-9]{10,})/);
    return m ? { kind: m[1] as "album" | "track", id: m[2] } : null;
  }
  if (provider === "apple_music") {
    const song = url.match(/[?&]i=(\d+)/);
    if (song) return { kind: "track", id: song[1] };
    const m = url.match(/\/(album|song)\/(?:[^/?#]+\/)?(\d+)/);
    return m ? { kind: m[1] === "song" ? "track" : "album", id: m[2] } : null;
  }
  const m = url.match(/tidal\.com\/(?:browse\/)?(album|track)\/(\d+)/);
  return m ? { kind: m[1] as "album" | "track", id: m[2] } : null;
}
