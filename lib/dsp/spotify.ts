/**
 * Spotify — Authorization Code + PKCE (no client secret, fully client-side).
 * Needs a public client id (NEXT_PUBLIC_SPOTIFY_CLIENT_ID) from an app whose
 * Redirect URI is this site's origin + "/".
 */

import type { Release } from "../types";
import {
  base64url,
  clearToken,
  cleanUrl,
  loadDspConfig,
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

// Start from the build-time inline; /api/dsp-config overlays the live server
// value at runtime (see ensureDspConfig in ./index.ts) so a client id set in
// Vercel works immediately — no redeploy, no INVALID_CLIENT screen.
let CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
export function setSpotifyClientId(id: string) {
  if (id) CLIENT_ID = id;
}
// `user-read-private` is REQUIRED: creating a playlist needs the user id from
// GET /v1/me, and that endpoint answers 403 "Insufficient client scope" without
// a user-read scope — even though the playlist scopes themselves are present.
const SCOPES = "playlist-modify-public playlist-modify-private user-read-private";
// Bumped whenever SCOPES changes. A token minted under an older scope set is
// missing the new permission, so it must be discarded rather than left to fail
// with a 403 the user can't diagnose.
const SCOPE_KEY = "pulsar_spotify_scopes";
// The PKCE verifier is mirrored into localStorage because some mobile browsers
// (and in-app webviews) drop sessionStorage across the OAuth round-trip, which
// otherwise strands the user in a redirect loop.
const VERIFIER_KEY = "pulsar_spotify_verifier";
const JUST_AUTHED = "pulsar_spotify_just_authed";

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

// sessionStorage throws in some privacy modes — never let bookkeeping break the
// export itself.
function safeGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
function safeRemove(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// The scope marker must outlive the tab, exactly like the token it describes —
// sessionStorage would force a pointless re-consent every new session.
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
  // If no client id was inlined at build time, pull the live one from the
  // server before bouncing out to Spotify — otherwise the authorize screen
  // can only answer INVALID_CLIENT.
  if (!CLIENT_ID) setSpotifyClientId((await loadDspConfig()).spotifyClientId);
  const verifier = randomString(48);
  const challenge = base64url(await sha256(verifier));
  setVerifier(verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state: "spotify",
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/** Thrown when the session is dead — callers must stop, not silently skip. */
class SpotifyAuthError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(path: string, token: string, init?: RequestInit, attempt = 0): Promise<any> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  // Rate limited — Spotify tells us exactly how long to wait. Honour it rather
  // than failing the whole export (very common with a large crate).
  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get("Retry-After") ?? "2");
    await sleep(Math.min(Math.max(wait, 1), 10) * 1000);
    return api(path, token, init, attempt + 1);
  }
  if (res.status === 401) {
    clearToken("spotify");
    throw new SpotifyAuthError("Spotify session expired — tap export again to reconnect.");
  }
  if (res.status === 403) {
    // Almost always the Development-mode allow-list: a Spotify app that hasn't
    // been through extension review only works for accounts explicitly listed
    // under Users & Access. Retrying with the same token can never succeed, so
    // the message points at the two things that actually resolve it.
    throw new SpotifyAuthError(
      "Spotify refused the request (403). Your app is most likely in Development mode, " +
        "which only works for accounts you've allow-listed. Add the Spotify account you're " +
        "signed in as under Users & Access in the developer dashboard — or reconnect below " +
        "if you signed in with a different account."
    );
  }
  // Transient server errors: one quick retry before giving up.
  if (res.status >= 500 && attempt < 2) {
    await sleep(600 * (attempt + 1));
    return api(path, token, init, attempt + 1);
  }
  if (!res.ok) throw new Error(`Spotify API ${res.status}`);
  return res.status === 204 ? null : res.json();
}

const normalise = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]/g, "");

/** Does a Spotify result actually belong to the artist we asked for? */
export function artistMatches(want: string, credits: { name?: string }[] | undefined): boolean {
  const w = normalise(want);
  return (credits ?? []).some((a) => {
    const got = normalise(a.name ?? "");
    return got.length > 0 && (got.includes(w) || w.includes(got));
  });
}

/**
 * Resolve one saved release to Spotify track URIs.
 * Albums/EPs expand to their full tracklist; singles resolve to one track.
 * Matches are artist-verified so a crate never fills up with the wrong record.
 * Auth errors propagate — silently skipping them would build a half-empty
 * playlist with no explanation.
 */
export async function urisForRelease(r: Release, token: string): Promise<string[]> {
  const term = searchTerm(r);
  const wantAlbum = r.type === "album" || r.type === "ep";

  if (wantAlbum) {
    try {
      const found = await api(
        `/search?q=${encodeURIComponent(term)}&type=album&limit=5`,
        token
      );
      const items = found?.albums?.items ?? [];
      const album =
        items.find(
          (a: any) =>
            artistMatches(r.artist, a.artists) &&
            normalise(a.name ?? "").includes(normalise(r.title).slice(0, 12))
        ) ?? items.find((a: any) => artistMatches(r.artist, a.artists));
      if (album?.id) {
        const tracks = await api(`/albums/${album.id}/tracks?limit=50`, token);
        const uris = (tracks?.items ?? []).map((t: { uri: string }) => t.uri).filter(Boolean);
        if (uris.length) return uris;
      }
    } catch (e) {
      if (e instanceof SpotifyAuthError) throw e;
      /* fall through to a single-track match */
    }
  }

  try {
    const found = await api(
      `/search?q=${encodeURIComponent(term)}&type=track&limit=5`,
      token
    );
    const items = found?.tracks?.items ?? [];
    const track = items.find((t: any) => artistMatches(r.artist, t.artists)) ?? null;
    return track?.uri ? [track.uri] : [];
  } catch (e) {
    if (e instanceof SpotifyAuthError) throw e;
    return [];
  }
}

export const spotifyProvider: DspProvider = {
  key: "spotify",
  label: "Spotify",
  configured: () => CLIENT_ID.length > 0,

  async createPlaylist(name, releases, onProgress?: ProgressFn): Promise<BuildResult | "redirecting"> {
    let token = readToken("spotify");

    // A token granted before the scope list changed can't do what we now need.
    // Discard it and re-consent silently rather than surfacing a 403 the user
    // has no way to act on.
    if (token && readScopes() !== SCOPES) {
      clearToken("spotify");
      token = null;
    }

    if (!token) {
      // A failed consent / token exchange leaves a specific diagnosis in
      // storage — show that instead of bouncing straight back to Spotify.
      const authErr = takeAuthError("spotify");
      if (authErr) throw new Error(authErr);
      // Guard against a redirect loop: if we *just* came back from consent and
      // still have no token, something is misconfigured — surface it instead of
      // bouncing the user to Spotify again.
      if (safeGet(JUST_AUTHED)) {
        safeRemove(JUST_AUTHED);
        throw new Error(
          "Couldn't complete Spotify sign-in. Check that the app's Redirect URI is exactly " +
            `${redirectUri()} and that this account is listed under Users & Access if the app is in Development mode.`
        );
      }
      await beginAuth();
      return "redirecting";
    }
    // We have a working token — make sure a leftover flag from an earlier failed
    // attempt can't make the NEXT export throw spuriously.
    safeRemove(JUST_AUTHED);

    const body = JSON.stringify({
      name,
      public: false,
      description: "Made with Pulsar — music discovery.",
    });

    // The documented way to create a playlist is POST /v1/users/{id}/playlists,
    // which needs the id from GET /v1/me. If that profile read is refused for
    // any reason, fall back to POST /v1/me/playlists rather than failing the
    // whole export — Spotify accepts it and infers the user from the token.
    let playlist: any = null;
    try {
      const me = await api("/me", token.access_token);
      if (me?.id) {
        playlist = await api(`/users/${encodeURIComponent(me.id)}/playlists`, token.access_token, {
          method: "POST",
          body,
        });
      }
    } catch (e) {
      if (e instanceof SpotifyAuthError && /expired/i.test(e.message)) throw e; // 401 is fatal
      /* 403 on the profile read — try the token-inferred route below */
    }

    if (!playlist?.id) {
      playlist = await api("/me/playlists", token.access_token, { method: "POST", body });
    }
    if (!playlist?.id) throw new Error("Spotify didn't return a playlist.");

    const seen = new Set<string>();
    const allUris: string[] = [];
    let addedReleases = 0;
    for (let i = 0; i < releases.length; i++) {
      const uris = await urisForRelease(releases[i], token.access_token);
      if (uris.length) addedReleases++;
      // De-duplicate so the same track never lands twice.
      for (const u of uris) {
        if (!seen.has(u)) {
          seen.add(u);
          allUris.push(u);
        }
      }
      onProgress?.(i + 1, releases.length);
    }

    for (let i = 0; i < allUris.length; i += 100) {
      await api(`/playlists/${playlist.id}/tracks`, token.access_token, {
        method: "POST",
        body: JSON.stringify({ uris: allUris.slice(i, i + 100) }),
      });
    }
    return {
      provider: "spotify",
      url: playlist.external_urls?.spotify ?? "https://open.spotify.com",
      name,
      addedReleases,
      totalReleases: releases.length,
      trackCount: allUris.length,
    };
  },

  async completeRedirect(): Promise<boolean> {
    const url = new URL(window.location.href);
    if (url.searchParams.get("state") !== "spotify") return false;

    // Spotify reports consent denial / misconfiguration here.
    const oauthError = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const verifier = getVerifier();
    // Always tidy the address bar, whatever the outcome.
    cleanUrl();

    if (oauthError) {
      // The authorize endpoint names the problem; translate the common ones
      // into what actually fixes them.
      const msg =
        oauthError === "redirect_uri_mismatch"
          ? "Spotify rejected the sign-in: the Redirect URI registered in your Spotify " +
            "developer dashboard doesn't match this site exactly. Open the dashboard, edit " +
            `the app's settings, and add ${redirectUri()} — including the trailing slash — as a Redirect URI.`
          : oauthError === "invalid_client"
            ? "Spotify doesn't recognize this app's Client ID. Re-copy it from the app's page " +
              "in the Spotify developer dashboard into your deployment's SPOTIFY_CLIENT_ID."
            : `Spotify sign-in was refused ("${oauthError}"). If you denied consent, just try again.`;
      setAuthError("spotify", msg);
      clearVerifier();
      return false;
    }

    if (!code || !verifier) {
      clearVerifier();
      return false;
    }

    // Mark that we just finished consent, so a still-missing token surfaces a
    // real error instead of bouncing back to Spotify forever.
    safeSet(JUST_AUTHED, "1");

    try {
      const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri(),
          code_verifier: verifier,
        }),
      });
      if (!res.ok) {
        // The token endpoint names the failure. Map the two that matter to the
        // exact fix; anything else gets a general but honest message.
        let reason = "";
        try {
          reason = (await res.json())?.error ?? "";
        } catch {
          /* no body */
        }
        setAuthError(
          "spotify",
          reason === "invalid_client"
            ? "Spotify doesn't recognize this app's Client ID. Re-copy it from the app's page " +
              "in the Spotify developer dashboard into your deployment's SPOTIFY_CLIENT_ID " +
              "(then reconnect — no redeploy needed)."
            : reason === "invalid_grant"
              ? "Spotify couldn't finish the sign-in (the one-time code was already spent or " +
                "expired). Most often this means the Redirect URI in the dashboard isn't an " +
                `exact match for ${redirectUri()} — check the trailing slash — then reconnect.`
              : `Spotify's token endpoint refused the sign-in (${reason || res.status}). ` +
                "Check the app's Client ID and Redirect URI in the developer dashboard, then reconnect."
        );
        clearVerifier();
        safeRemove(JUST_AUTHED);
        return false;
      }
      const data = await res.json();
      if (!data?.access_token) return false;
      saveToken("spotify", data.access_token, data.expires_in ?? 3600);
      // Record what this token was actually granted, so a future scope change
      // invalidates it automatically.
      writeScopes(SCOPES);
      clearVerifier();
      safeRemove(JUST_AUTHED);
      return true;
    } catch {
      return false;
    }
  },
};
