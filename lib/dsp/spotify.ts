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
  plainTitle,
  sameTitle,
  takeAuthError,
  type BuildResult,
  type DspProvider,
  type ProgressFn,
  newOAuthState,
  checkOAuthState,
} from "./shared";

// Start from the build-time inline; /api/dsp-config overlays the live server
// value at runtime (see ensureDspConfig in ./index.ts) so a client id set in
// Vercel reaches the client from the next deployment without a rebuild of the
// client bundle. (Vercel itself still needs a redeploy for env changes.)
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
const FORCE_DIALOG = "pulsar_spotify_force_dialog";

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
    state: newOAuthState("spotify"),
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  // After "Reconnect", make Spotify show its account picker. Without
  // show_dialog it silently re-authorises whoever is signed in to Spotify, so
  // reconnecting could never switch to a different (allow-listed) account.
  if (safeGet(FORCE_DIALOG)) {
    params.set("show_dialog", "true");
    safeRemove(FORCE_DIALOG);
  }
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/** Thrown when the session is dead — callers must stop, not silently skip. */
class SpotifyAuthError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimal shapes of the Spotify API responses this code reads. */
interface SpotifyArtist {
  name?: string;
}
interface SpotifyAlbumItem {
  id?: string;
  name?: string;
  artists?: SpotifyArtist[];
}
interface SpotifyTrackItem {
  uri?: string;
  name?: string;
  artists?: SpotifyArtist[];
}
interface SpotifyPlaylist {
  id?: string;
  external_urls?: { spotify?: string };
  uri?: string;
}

interface ApiOpts {
  /**
   * Read a 403 as "this account isn't allow-listed". Only true for the calls
   * that establish who the user is (/me, creating a playlist). A 403 anywhere
   * else used to produce the same allow-list advice — including from the
   * retired /tracks endpoint, which sent even the app's owner to the dashboard.
   */
  allowlist403?: boolean;
}

/** An HTTP failure with its status, so callers can fall back on 404s. */
class SpotifyHttpError extends Error {
  constructor(readonly status: number, path: string) {
    super(`Spotify API ${status} at ${path.split("?")[0]}`);
  }
}

async function api(
  path: string,
  token: string,
  init?: RequestInit,
  opts: ApiOpts = {},
  attempt = 0
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  // Rate limited — Spotify tells us exactly how long to wait. Honour it rather
  // than failing the whole export (very common with a large crate).
  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get("Retry-After") ?? "2");
    await sleep(Math.min(Math.max(wait, 1), 10) * 1000);
    return api(path, token, init, opts, attempt + 1);
  }
  if (res.status === 401) {
    clearToken("spotify");
    throw new SpotifyAuthError("Spotify session expired — tap export again to reconnect.");
  }
  if (res.status === 403 && !opts.allowlist403) {
    // Still fatal — retrying with this token can't help — but not described as
    // an allow-list problem, which it usually isn't for these calls.
    throw new SpotifyAuthError(`Spotify refused the request at ${path.split("?")[0]} (403).`);
  }
  if (res.status === 403 && opts.allowlist403) {
    // Development Mode: since February 2026 Spotify caps an app that hasn't
    // been granted extended quota at 5 allow-listed accounts (and extended
    // quota now goes only to large organisations), so for most visitors this
    // is permanent. Say it in words a listener can act on, and keep the owner's
    // fix in the same message.
    throw new SpotifyAuthError(
      "Spotify only lets this Pulsar create playlists for accounts its owner has approved " +
        "(Spotify limits apps like this to 5). Use Copy list or Download CSV instead. " +
        "If this is your Pulsar: add this Spotify account under Users & Access in the " +
        "developer dashboard, then reconnect."
    );
  }
  // Transient server errors: one quick retry, for reads only. Retrying a POST
  // that may have succeeded server-side makes a duplicate playlist.
  const method = (init?.method ?? "GET").toUpperCase();
  if (res.status >= 500 && attempt < 2 && method === "GET") {
    await sleep(600 * (attempt + 1));
    return api(path, token, init, opts, attempt + 1);
  }
  if (!res.ok) throw new SpotifyHttpError(res.status, path);
  // 204 = no content (some POSTs) — callers only branch on `?.id` etc.
  return res.status === 204 ? {} : ((await res.json()) as Record<string, unknown>);
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
 *
 * Albums/EPs expand to their full tracklist; singles resolve to one track.
 * Both the ARTIST and the TITLE must match. This used to fall back to the
 * artist's first album whenever the title check failed — and feed titles like
 * "Love - EP" failed it constantly — so up to 50 tracks of the wrong record
 * were added and counted as found. Singles took the artist's top hit with no
 * title check at all. A "not found" is better than the wrong record.
 *
 * Searches with Spotify's field filters first (artist:/album:/track:), then
 * plain text. Auth errors propagate.
 */
export async function urisForRelease(r: Release, token: string): Promise<string[]> {
  const title = plainTitle(r).replace(/["]/g, "");
  const artist = r.artist.replace(/["]/g, "");
  const wantAlbum = r.type === "album" || r.type === "ep";
  const queries = (field: "album" | "track") => [
    `${field}:"${title}" artist:"${artist}"`,
    searchTerm(r),
  ];

  const search = async <T,>(q: string, type: "album" | "track"): Promise<T[]> => {
    // A 403 on search is the first sign of an account that isn't allow-listed.
    const found = await api(`/search?q=${encodeURIComponent(q)}&type=${type}&limit=5`, token, undefined, {
      allowlist403: true,
    });
    const bucket = found?.[`${type}s`] as { items?: T[] } | undefined;
    return bucket?.items ?? [];
  };

  if (wantAlbum) {
    try {
      for (const q of queries("album")) {
        const items = await search<SpotifyAlbumItem>(q, "album");
        const album = items.find((a) => artistMatches(r.artist, a.artists) && sameTitle(r, a.name));
        if (!album?.id) continue;
        // Paged: albums over 50 tracks were cut off at 50.
        const uris: string[] = [];
        let next: string | null = `/albums/${album.id}/tracks?limit=50`;
        while (next && uris.length < 300) {
          const page = await api(next, token);
          for (const t of (page?.items as { uri?: string }[] | undefined) ?? []) if (t?.uri) uris.push(t.uri);
          const n = page?.next as string | null | undefined;
          next = n ? n.replace("https://api.spotify.com/v1", "") : null;
        }
        if (uris.length) return uris;
      }
    } catch (e) {
      if (e instanceof SpotifyAuthError) throw e;
      /* fall through to a single-track match */
    }
  }

  try {
    for (const q of queries("track")) {
      const items = await search<SpotifyTrackItem>(q, "track");
      const track = items.find((t) => artistMatches(r.artist, t.artists) && sameTitle(r, t.name));
      if (track?.uri) return [track.uri];
    }
    return [];
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

    // Match FIRST, create second. This used to create the playlist and then go
    // looking for tracks — so a crate where nothing matched, or a session that
    // died halfway through matching, left an empty "Made with Pulsar" playlist
    // on the user's account and still showed a success card.
    const seen = new Set<string>();
    const allUris: string[] = [];
    let addedReleases = 0;
    const unmatched: string[] = [];
    for (let i = 0; i < releases.length; i++) {
      const uris = await urisForRelease(releases[i], token.access_token);
      if (uris.length) addedReleases++;
      else unmatched.push(`${releases[i].artist} — ${releases[i].title}`);
      // De-duplicate so the same track never lands twice.
      for (const u of uris) {
        if (!seen.has(u)) {
          seen.add(u);
          allUris.push(u);
        }
      }
      onProgress?.(i + 1, releases.length);
    }
    if (allUris.length === 0) {
      throw new Error(
        `None of the ${releases.length} record${releases.length === 1 ? "" : "s"} in this crate could be found on Spotify, so no playlist was created.`
      );
    }

    const body = JSON.stringify({
      name,
      public: false,
      description: "Made with Pulsar — music discovery.",
    });

    // Spotify's February 2026 changes (applied to existing apps from 9 March
    // 2026) retired POST /users/{id}/playlists and renamed the add-tracks call
    // from /playlists/{id}/tracks to /playlists/{id}/items. This code used the
    // old add call, so since March every export created a playlist and then
    // failed to put anything in it. The current endpoints come first; the old
    // ones are tried only on a 404, for apps still on the previous API.
    let playlist: SpotifyPlaylist;
    try {
      playlist = (await api(
        "/me/playlists",
        token.access_token,
        { method: "POST", body },
        { allowlist403: true }
      )) as SpotifyPlaylist;
    } catch (e) {
      if (!(e instanceof SpotifyHttpError && (e.status === 404 || e.status === 405))) throw e;
      const me = (await api("/me", token.access_token, undefined, { allowlist403: true })) as { id?: string };
      if (!me?.id) throw new Error("Spotify didn't say which account this is.");
      playlist = (await api(
        `/users/${encodeURIComponent(me.id)}/playlists`,
        token.access_token,
        { method: "POST", body },
        { allowlist403: true }
      )) as SpotifyPlaylist;
    }
    if (!playlist?.id) throw new Error("Spotify didn't return a playlist.");

    let itemsPath = `/playlists/${playlist.id}/items`;
    for (let i = 0; i < allUris.length; i += 100) {
      const chunk = JSON.stringify({ uris: allUris.slice(i, i + 100) });
      try {
        await api(itemsPath, token.access_token, { method: "POST", body: chunk });
      } catch (e) {
        if (!(e instanceof SpotifyHttpError && e.status === 404) || itemsPath.endsWith("/tracks")) throw e;
        itemsPath = `/playlists/${playlist.id}/tracks`;
        await api(itemsPath, token.access_token, { method: "POST", body: chunk });
      }
    }
    return {
      provider: "spotify",
      url: playlist.external_urls?.spotify ?? "https://open.spotify.com",
      name,
      addedReleases,
      totalReleases: releases.length,
      trackCount: allUris.length,
      unmatched,
    };
  },

  disconnect() {
    clearToken("spotify");
    clearVerifier();
    safeSet(FORCE_DIALOG, "1");
  },

  async completeRedirect(): Promise<boolean> {
    const url = new URL(window.location.href);
    const stateCheck = checkOAuthState("spotify", url.searchParams.get("state"));
    if (stateCheck === "other") return false;
    if (stateCheck === "mismatch") {
      // Not a sign-in this browser started. Don't spend the code.
      cleanUrl();
      clearVerifier();
      setAuthError("spotify", "Spotify sign-in couldn't be verified. Please try exporting again.");
      return false;
    }

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
              "(then redeploy — Vercel applies env changes only to new deployments — and reconnect)."
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
