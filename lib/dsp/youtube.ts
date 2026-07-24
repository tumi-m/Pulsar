/**
 * YouTube Music — Google OAuth (implicit flow, no secret) + YouTube Data API v3.
 * Needs a public client id (NEXT_PUBLIC_GOOGLE_CLIENT_ID) from a Google Cloud
 * OAuth "Web application" whose Authorised JavaScript origin + redirect URI is
 * this site's origin. The `youtube` scope is sensitive, so for public use the
 * OAuth consent screen must be verified by Google.
 *
 * Note: each track search costs 100 quota units (default 10k/day ≈ 100 lookups).
 */

import type { Release } from "../types";
import {
  cleanUrl,
  clearToken,
  readToken,
  redirectUri,
  saveToken,
  searchTerm,
  type BuildResult,
  type DspProvider,
  type ProgressFn,
} from "./shared";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const SCOPE = "https://www.googleapis.com/auth/youtube";

function beginAuth() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "token", // implicit → token in URL hash, no secret needed
    scope: SCOPE,
    state: "youtube",
    include_granted_scopes: "true",
    prompt: "consent",
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function api(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`https://www.googleapis.com/youtube/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    clearToken("youtube");
    throw new Error("YouTube session expired — reconnect to continue.");
  }
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  return res.json();
}

async function videoIdFor(r: Release, token: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(searchTerm(r));
    const found = await api(`/search?part=snippet&type=video&maxResults=1&q=${q}`, token);
    return found?.items?.[0]?.id?.videoId ?? null;
  } catch {
    return null;
  }
}

export const youtubeProvider: DspProvider = {
  key: "youtube_music",
  label: "YouTube Music",
  configured: () => CLIENT_ID.length > 0,

  async createPlaylist(name, releases, onProgress?: ProgressFn): Promise<BuildResult | "redirecting"> {
    const token = readToken("youtube");
    if (!token) {
      beginAuth();
      return "redirecting";
    }
    const playlist = await api("/playlists?part=snippet,status", token.access_token, {
      method: "POST",
      body: JSON.stringify({
        snippet: { title: name, description: "Made with Pulsar — music discovery." },
        status: { privacyStatus: "private" },
      }),
    });

    let addedReleases = 0;
    let trackCount = 0;
    for (let i = 0; i < releases.length; i++) {
      const videoId = await videoIdFor(releases[i], token.access_token);
      if (videoId) {
        try {
          await api("/playlistItems?part=snippet", token.access_token, {
            method: "POST",
            body: JSON.stringify({
              snippet: { playlistId: playlist.id, resourceId: { kind: "youtube#video", videoId } },
            }),
          });
          addedReleases++;
          trackCount++;
        } catch {
          /* skip a failed insert */
        }
      }
      onProgress?.(i + 1, releases.length);
    }
    return {
      provider: "youtube_music",
      url: `https://music.youtube.com/playlist?list=${playlist.id}`,
      name,
      addedReleases,
      totalReleases: releases.length,
      trackCount,
    };
  },

  async completeRedirect(): Promise<boolean> {
    // Implicit flow returns the token in the URL fragment.
    if (!window.location.hash) return false;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("state") !== "youtube") return false;
    const accessToken = hash.get("access_token");
    const expiresIn = Number(hash.get("expires_in") ?? "3600");
    cleanUrl();
    if (!accessToken) return false;
    saveToken("youtube", accessToken, expiresIn);
    return true;
  },
};
