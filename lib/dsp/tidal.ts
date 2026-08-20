/**
 * TIDAL — Authorization Code + PKCE, no client secret.
 *
 * WHY THIS EXISTS
 *
 * TIDAL is the only remaining major service whose playlist-write API is open to
 * new applications. Deezer stopped issuing tokens to new apps and SoundCloud's
 * API is closed, so the realistic ceiling for native export is Spotify + Apple +
 * YouTube + TIDAL, and this is the fourth.
 *
 * It uses the same flow as ./spotify.ts — Authorization Code with PKCE, public
 * client, no secret — so this file is deliberately shaped like that one.
 *
 * ⚠ WRITTEN AGAINST DOCUMENTATION, NOT AGAINST A LIVE API.
 *
 * The session that wrote this could not reach openapi.tidal.com (egress
 * blocked), so no request here has ever been executed. The endpoint paths, the
 * JSON:API envelopes and the search response shape are from TIDAL's published
 * contract and are the most likely thing to be wrong on first run.
 *
 * Two deliberate consequences:
 *   1. Nothing activates until a client id is configured — `configured()`
 *      returns false, so the export sheet keeps offering CSV as it does today.
 *      An unverified provider cannot break a working feature.
 *   2. Errors are surfaced verbatim rather than swallowed. When you first run
 *      this, a wrong path will say so — `TIDAL API 404 at /playlists` — instead
 *      of quietly producing an empty playlist. That is the difference between
 *      ten minutes of fixing and a day of guessing.
 *
 * Access note: TIDAL approves Open API access per client id rather than issuing
 * it instantly, so the id has to be requested before any of this can run.
 *   https://developer.tidal.com/documentation
 */

import type { Release } from "../types";
import {
  base64url,
  clearToken,
  cleanUrl,
  randomString,
  readToken,
  redirectUri,
  saveToken,
  setAuthError,
  sha256,
  searchTerm,
  takeAuthError,
  type BuildResult,
  type DspProvider,
  type ProgressFn,
} from "./shared";

let CLIENT_ID = process.env.NEXT_PUBLIC_TIDAL_CLIENT_ID ?? "";
export function setTidalClientId(id: string) {
  if (id) CLIENT_ID = id;
}

const AUTH_URL = "https://login.tidal.com/authorize";
const TOKEN_URL = "https://auth.tidal.com/v1/oauth2/token";
const API_BASE = "https://openapi.tidal.com/v2";

/** Only what an export needs: find tracks, make a playlist, put them in it. */
const SCOPES = "playlists.write playlists.read collection.read user.read";
const SCOPE_KEY = "pulsar_tidal_scopes";
const VERIFIER_KEY = "pulsar_tidal_verifier";
const JUST_AUTHED = "pulsar_tidal_just_authed";

/** TIDAL requires a country code on catalogue reads. */
function countryCode(): string {
  try {
    const loc = navigator.language.split("-")[1];
    return loc && /^[A-Z]{2}$/i.test(loc) ? loc.toUpperCase() : "US";
  } catch {
    return "US";
  }
}

// Mirrored to localStorage: some mobile browsers drop sessionStorage across the
// OAuth round-trip, which strands the user in a redirect loop.
function setVerifier(v: string) {
  try {
    sessionStorage.setItem(VERIFIER_KEY, v);
    localStorage.setItem(VERIFIER_KEY, v);
  } catch {
    /* storage unavailable — auth will fail loudly rather than silently */
  }
}
function getVerifier(): string | null {
  try {
    return sessionStorage.getItem(VERIFIER_KEY) ?? localStorage.getItem(VERIFIER_KEY);
  } catch {
    return null;
  }
}
function clearVerifier() {
  try {
    sessionStorage.removeItem(VERIFIER_KEY);
    localStorage.removeItem(VERIFIER_KEY);
  } catch {
    /* ignore */
  }
}
function safeGet(k: string): string | null {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}
function safeRemove(k: string) {
  try {
    sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
function readScopes(): string | null {
  try {
    return localStorage.getItem(SCOPE_KEY);
  } catch {
    return null;
  }
}
function writeScopes(v: string) {
  try {
    localStorage.setItem(SCOPE_KEY, v);
  } catch {
    /* ignore */
  }
}

async function beginAuth() {
  const verifier = randomString(48);
  const challenge = base64url(await sha256(verifier));
  setVerifier(verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state: "tidal",
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `${AUTH_URL}?${params.toString()}`;
}

/** Fatal for the whole export — callers must stop rather than skip a track. */
class TidalAuthError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(
  path: string,
  token: string,
  init?: RequestInit,
  attempt = 0
): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      // TIDAL's v2 API is JSON:API — the vnd.api+json content type is required
      // on writes and it rejects application/json with a 415.
      Accept: "application/vnd.api+json",
      ...(init?.body ? { "Content-Type": "application/vnd.api+json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get("Retry-After") ?? "2");
    await sleep(Math.min(Math.max(wait, 1), 10) * 1000);
    return api(path, token, init, attempt + 1);
  }
  if (res.status === 401) {
    clearToken("tidal");
    throw new TidalAuthError("TIDAL session expired — tap export again to reconnect.");
  }
  if (res.status === 403) {
    throw new TidalAuthError(
      "TIDAL refused the request (403). The usual cause is that this client id " +
        "hasn't been approved for Open API access yet, or the token is missing the " +
        "playlists.write scope — disconnect and reconnect to re-consent."
    );
  }
  if (res.status >= 500 && attempt < 2) {
    await sleep(600 * (attempt + 1));
    return api(path, token, init, attempt + 1);
  }
  if (!res.ok) {
    // Say WHERE it failed. Because these paths are unverified, the first real
    // run is a debugging session and a bare status code wastes it.
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.errors?.[0]?.detail ?? body?.errors?.[0]?.title ?? "";
    } catch {
      /* no JSON body */
    }
    throw new Error(`TIDAL API ${res.status} at ${path}${detail ? ` — ${detail}` : ""}`);
  }
  return res.status === 204 ? null : res.json();
}

const normalise = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]/g, "");

/** Does a TIDAL result actually belong to the artist we asked for? */
export function tidalArtistMatches(want: string, got: string | undefined): boolean {
  const w = normalise(want);
  const g = normalise(got ?? "");
  return g.length > 0 && (g.includes(w) || w.includes(g));
}

/**
 * Resolve one saved release to TIDAL track ids.
 *
 * Verified by artist, exactly like the Spotify provider: an export that quietly
 * fills with the wrong records is worse than one that comes up short.
 */
export async function trackIdsForRelease(r: Release, token: string): Promise<string[]> {
  const term = searchTerm(r);
  try {
    const found = await api(
      `/searchResults/${encodeURIComponent(term)}?countryCode=${countryCode()}&include=tracks`,
      token
    );
    // JSON:API: matches arrive in `included`, typed.
    const included: any[] = found?.included ?? [];
    const tracks = included.filter((i) => i?.type === "tracks");
    const hit = tracks.find((t) =>
      tidalArtistMatches(r.artist, t?.attributes?.artists?.[0]?.name ?? t?.attributes?.artistName)
    );
    const id = hit?.id ?? null;
    return id ? [String(id)] : [];
  } catch (e) {
    if (e instanceof TidalAuthError) throw e;
    return [];
  }
}

export const tidalProvider: DspProvider = {
  key: "tidal",
  label: "TIDAL",
  // Dormant until a client id exists. With none, the export sheet keeps
  // offering the CSV flow rather than a button that can only fail.
  configured: () => CLIENT_ID.length > 0,

  async createPlaylist(name, releases, onProgress?: ProgressFn): Promise<BuildResult | "redirecting"> {
    let token = readToken("tidal");

    if (token && readScopes() !== SCOPES) {
      clearToken("tidal");
      token = null;
    }

    if (!token) {
      const authErr = takeAuthError("tidal");
      if (authErr) throw new Error(authErr);
      if (safeGet(JUST_AUTHED)) {
        safeRemove(JUST_AUTHED);
        throw new Error(
          "Couldn't complete TIDAL sign-in. Check the app's Redirect URI is exactly " +
            `${redirectUri()} and that this client id has been approved for Open API access.`
        );
      }
      await beginAuth();
      return "redirecting";
    }
    safeRemove(JUST_AUTHED);

    const playlist = await api("/playlists", token.access_token, {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "playlists",
          attributes: {
            name,
            description: "Made with Pulsar — music discovery.",
            accessType: "UNLISTED",
          },
        },
      }),
    });

    const playlistId = playlist?.data?.id;
    if (!playlistId) throw new Error("TIDAL didn't return a playlist id.");

    const seen = new Set<string>();
    const ids: string[] = [];
    let addedReleases = 0;
    for (let i = 0; i < releases.length; i++) {
      const found = await trackIdsForRelease(releases[i], token.access_token);
      if (found.length) addedReleases++;
      for (const id of found) {
        if (!seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
      onProgress?.(i + 1, releases.length);
    }

    // Batched, like Spotify's 100-per-request limit.
    for (let i = 0; i < ids.length; i += 20) {
      await api(`/playlists/${playlistId}/relationships/items`, token.access_token, {
        method: "POST",
        body: JSON.stringify({
          data: ids.slice(i, i + 20).map((id) => ({ id, type: "tracks" })),
        }),
      });
    }

    return {
      provider: "tidal",
      url: `https://tidal.com/playlist/${playlistId}`,
      name,
      addedReleases,
      totalReleases: releases.length,
      trackCount: ids.length,
    };
  },

  async completeRedirect(): Promise<boolean> {
    const url = new URL(window.location.href);
    if (url.searchParams.get("state") !== "tidal") return false;

    const error = url.searchParams.get("error");
    if (error) {
      setAuthError("tidal", `TIDAL sign-in was refused: ${error}`);
      cleanUrl();
      return false;
    }

    const code = url.searchParams.get("code");
    const verifier = getVerifier();
    cleanUrl();
    if (!code || !verifier) return false;

    try {
      // Public client + PKCE: the verifier stands in for a secret, so this
      // exchange is safe from the browser and needs no server route (unlike
      // Google, whose Web client type demands a secret).
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: CLIENT_ID,
          code,
          redirect_uri: redirectUri(),
          code_verifier: verifier,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.access_token) {
        setAuthError(
          "tidal",
          data.error_description || data.error || "TIDAL token exchange failed."
        );
        return false;
      }
      saveToken("tidal", data.access_token, Number(data.expires_in ?? 3600));
      writeScopes(SCOPES);
      safeSet(JUST_AUTHED, "1");
      return true;
    } catch {
      setAuthError("tidal", "Couldn't reach TIDAL to complete sign-in.");
      return false;
    } finally {
      clearVerifier();
    }
  },
};
