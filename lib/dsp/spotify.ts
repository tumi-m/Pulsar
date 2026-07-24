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
  randomString,
  readToken,
  redirectUri,
  saveToken,
  sha256,
  searchTerm,
  type BuildResult,
  type DspProvider,
  type ProgressFn,
} from "./shared";

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const SCOPES = "playlist-modify-public playlist-modify-private";
const VERIFIER_KEY = "pulsar_spotify_verifier";

async function beginAuth() {
  const verifier = randomString(48);
  const challenge = base64url(await sha256(verifier));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
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

async function api(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    clearToken("spotify");
    throw new Error("Spotify session expired — reconnect to continue.");
  }
  if (!res.ok) throw new Error(`Spotify API ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function urisForRelease(r: Release, token: string): Promise<string[]> {
  const term = searchTerm(r);
  // Prefer the whole album/single so every track lands in the playlist.
  try {
    const found = await api(`/search?q=${encodeURIComponent(term)}&type=album&limit=1`, token);
    const album = found?.albums?.items?.[0];
    if (album?.id) {
      const tracks = await api(`/albums/${album.id}/tracks?limit=50`, token);
      const uris = (tracks?.items ?? []).map((t: { uri: string }) => t.uri).filter(Boolean);
      if (uris.length) return uris;
    }
  } catch {
    /* fall through */
  }
  try {
    const found = await api(`/search?q=${encodeURIComponent(term)}&type=track&limit=1`, token);
    const uri = found?.tracks?.items?.[0]?.uri;
    return uri ? [uri] : [];
  } catch {
    return [];
  }
}

export const spotifyProvider: DspProvider = {
  key: "spotify",
  label: "Spotify",
  configured: () => CLIENT_ID.length > 0,

  async createPlaylist(name, releases, onProgress?: ProgressFn): Promise<BuildResult | "redirecting"> {
    const token = readToken("spotify");
    if (!token) {
      await beginAuth();
      return "redirecting";
    }
    const me = await api("/me", token.access_token);
    const playlist = await api(`/users/${me.id}/playlists`, token.access_token, {
      method: "POST",
      body: JSON.stringify({ name, public: false, description: "Made with Pulsar — music discovery." }),
    });

    const allUris: string[] = [];
    let addedReleases = 0;
    for (let i = 0; i < releases.length; i++) {
      const uris = await urisForRelease(releases[i], token.access_token);
      if (uris.length) addedReleases++;
      allUris.push(...uris);
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
    const code = url.searchParams.get("code");
    if (!code) return false;
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    cleanUrl();
    if (!verifier) return false;
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
    if (!res.ok) return false;
    const data = await res.json();
    saveToken("spotify", data.access_token, data.expires_in ?? 3600);
    sessionStorage.removeItem(VERIFIER_KEY);
    return true;
  },
};
