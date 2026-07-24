/**
 * Apple Music — MusicKit JS. Uses a developer token (minted server-side at
 * /api/apple-token from an Apple Developer MusicKit key) and a Music User Token
 * obtained via an in-page authorize() popup — no full-page redirect.
 *
 * Enable by setting NEXT_PUBLIC_APPLE_MUSIC_ENABLED=true and the server env
 * APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY (requires a paid Apple
 * Developer membership).
 */

import type { Release } from "../types";
import { searchTerm, type BuildResult, type DspProvider, type ProgressFn } from "./shared";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    MusicKit?: any;
  }
}

const ENABLED = process.env.NEXT_PUBLIC_APPLE_MUSIC_ENABLED === "true";
const MUSICKIT_SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";

let musicKitReady: Promise<any> | null = null;

async function loadMusicKit(): Promise<any> {
  if (musicKitReady) return musicKitReady;
  musicKitReady = (async () => {
    // Fetch the signed developer token from our server route.
    const res = await fetch("/api/apple-token");
    if (!res.ok) throw new Error("Apple Music is not configured on the server.");
    const { token } = await res.json();
    if (!token) throw new Error("Apple Music developer token unavailable.");

    // Inject the MusicKit script once.
    if (!window.MusicKit) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = MUSICKIT_SRC;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load MusicKit."));
        document.head.appendChild(s);
      });
    }
    await window.MusicKit.configure({
      developerToken: token,
      app: { name: "Pulsar", build: "1.0" },
    });
    return window.MusicKit.getInstance();
  })();
  return musicKitReady;
}

async function amApi(music: any, path: string, init?: RequestInit) {
  const res = await fetch(`https://api.music.apple.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${music.developerToken}`,
      "Music-User-Token": music.musicUserToken,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Apple Music API ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function songIdFor(music: any, storefront: string, r: Release): Promise<string | null> {
  try {
    const term = encodeURIComponent(searchTerm(r));
    const found = await amApi(music, `/v1/catalog/${storefront}/search?types=songs&limit=1&term=${term}`);
    return found?.results?.songs?.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export const appleProvider: DspProvider = {
  key: "apple_music",
  label: "Apple Music",
  configured: () => ENABLED,

  async createPlaylist(name, releases, onProgress?: ProgressFn): Promise<BuildResult | "redirecting"> {
    const music = await loadMusicKit();
    await music.authorize(); // popup — sets music.musicUserToken
    const storefront = music.storefrontId || "us";

    const trackData: { id: string; type: "songs" }[] = [];
    let addedReleases = 0;
    for (let i = 0; i < releases.length; i++) {
      const id = await songIdFor(music, storefront, releases[i]);
      if (id) {
        trackData.push({ id, type: "songs" });
        addedReleases++;
      }
      onProgress?.(i + 1, releases.length);
    }

    const created = await amApi(music, "/v1/me/library/playlists", {
      method: "POST",
      body: JSON.stringify({
        attributes: { name, description: "Made with Pulsar — music discovery." },
        relationships: { tracks: { data: trackData } },
      }),
    });
    const id = created?.data?.[0]?.id;
    return {
      provider: "apple_music",
      url: id ? `https://music.apple.com/library/playlist/${id}` : "https://music.apple.com/library",
      name,
      addedReleases,
      totalReleases: releases.length,
      trackCount: trackData.length,
    };
  },
};
