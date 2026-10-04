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

let ENABLED = process.env.NEXT_PUBLIC_APPLE_MUSIC_ENABLED === "true";
export function setAppleEnabled(v: boolean) {
  ENABLED = v;
}
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
  // A failed load used to stay cached for the life of the page, so every retry
  // re-threw the same error without trying again. Forget it on failure.
  musicKitReady.catch(() => {
    musicKitReady = null;
  });
  return musicKitReady;
}

/**
 * Start loading MusicKit ahead of the click. Exported so the export sheet can
 * call it when it opens: authorize() opens a popup, and browsers only allow a
 * popup inside the user's click. Loading MusicKit (a token fetch plus a script)
 * AFTER the click spent that activation, so Safari — and often Chrome — blocked
 * the Apple sign-in window and the export failed before it began.
 */
export function prepareAppleMusic(): void {
  if (!ENABLED || typeof window === "undefined") return;
  loadMusicKit().catch(() => {
    musicKitReady = null; // let a later attempt retry
  });
}

class AppleFatalError extends Error {}

/** authorize() can wait forever on a popup the user abandoned; don't let it. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timed out")), ms)),
  ]);
}

/** The instance whose user token a 401/403 should invalidate. */
let currentMusic: any = null;

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
  if (res.status === 401 || res.status === 403) {
    // MusicKit hands back a cached Music User Token from authorize(); if it was
    // revoked, every later export reused it and failed identically. Drop it so
    // the next attempt asks again.
    try {
      await currentMusic?.unauthorize?.();
    } catch {
      /* best effort */
    }
    throw new AppleFatalError(
      res.status === 401
        ? "Apple Music rejected the developer token. Check APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY on the server."
        : "Apple Music refused access. This account needs an active Apple Music subscription to create playlists."
    );
  }
  if (!res.ok) throw new Error(`Apple Music API ${res.status}`);
  return res.status === 204 ? null : res.json();
}

const norm = (x: string) => x.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]/g, "");
const sameArtist = (want: string, got: string | undefined) => {
  const w = norm(want);
  const g = norm(got ?? "");
  return g.length > 0 && (g.includes(w) || w.includes(g));
};

/**
 * Song ids for one release. Albums and EPs expand to their full tracklist (as
 * Spotify's provider does); singles resolve to one song. Every match is
 * artist-checked: this took the first search hit whatever it was, so a common
 * title could drop a stranger's song into the playlist.
 */
async function songIdsFor(music: any, storefront: string, r: Release): Promise<string[]> {
  const term = encodeURIComponent(searchTerm(r));
  try {
    if (r.type === "album" || r.type === "ep") {
      const found = await amApi(music, `/v1/catalog/${storefront}/search?types=albums&limit=5&term=${term}`);
      const album = (found?.results?.albums?.data ?? []).find((a: any) =>
        sameArtist(r.artist, a?.attributes?.artistName)
      );
      if (album?.id) {
        const tracks = await amApi(music, `/v1/catalog/${storefront}/albums/${album.id}/tracks?limit=100`);
        const ids = (tracks?.data ?? [])
          .filter((t: any) => t?.type === "songs" && t?.id)
          .map((t: any) => String(t.id));
        if (ids.length) return ids;
      }
    }
    const found = await amApi(music, `/v1/catalog/${storefront}/search?types=songs&limit=5&term=${term}`);
    const song = (found?.results?.songs?.data ?? []).find((x: any) =>
      sameArtist(r.artist, x?.attributes?.artistName)
    );
    return song?.id ? [String(song.id)] : [];
  } catch (e) {
    if (e instanceof AppleFatalError) throw e;
    return [];
  }
}

export const appleProvider: DspProvider = {
  key: "apple_music",
  label: "Apple Music",
  configured: () => ENABLED,

  async disconnect() {
    try {
      const music = currentMusic ?? (musicKitReady ? await musicKitReady : null);
      await music?.unauthorize?.();
    } catch {
      /* nothing to forget */
    }
  },

  async createPlaylist(name, releases, onProgress?: ProgressFn): Promise<BuildResult | "redirecting"> {
    const music = await loadMusicKit();
    currentMusic = music;
    try {
      // A popup: it only opens inside the user's click, which is why the sheet
      // preloads MusicKit (prepareAppleMusic) before anyone taps export.
      await withTimeout(music.authorize(), 120_000); // sets music.musicUserToken
    } catch {
      throw new Error(
        "Apple Music sign-in didn't open or was closed. Allow pop-ups for this site and try again."
      );
    }
    if (!music.musicUserToken) {
      throw new Error("Apple Music sign-in didn't complete, so no playlist was created.");
    }
    const storefront = music.storefrontId || "us";

    const seen = new Set<string>();
    const trackData: { id: string; type: "songs" }[] = [];
    let addedReleases = 0;
    const unmatched: string[] = [];
    for (let i = 0; i < releases.length; i++) {
      const ids = await songIdsFor(music, storefront, releases[i]);
      if (ids.length) addedReleases++;
      else unmatched.push(`${releases[i].artist} — ${releases[i].title}`);
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        trackData.push({ id, type: "songs" });
      }
      onProgress?.(i + 1, releases.length);
    }
    // Nothing matched: say so rather than creating an empty playlist.
    if (trackData.length === 0) {
      throw new Error(
        `None of the ${releases.length} record${releases.length === 1 ? "" : "s"} could be found on Apple Music, so no playlist was created.`
      );
    }

    // Create with the first batch, append the rest: one request carrying an
    // entire large crate risks the API's request limits and fails all-or-nothing.
    const BATCH = 100;
    const created = await amApi(music, "/v1/me/library/playlists", {
      method: "POST",
      body: JSON.stringify({
        attributes: { name, description: "Made with Pulsar — music discovery." },
        relationships: { tracks: { data: trackData.slice(0, BATCH) } },
      }),
    });
    const newId = created?.data?.[0]?.id;
    if (newId) {
      for (let i = BATCH; i < trackData.length; i += BATCH) {
        await amApi(music, `/v1/me/library/playlists/${newId}/tracks`, {
          method: "POST",
          body: JSON.stringify({ data: trackData.slice(i, i + BATCH) }),
        });
      }
    }
    const id = created?.data?.[0]?.id;
    return {
      provider: "apple_music",
      url: id ? `https://music.apple.com/library/playlist/${id}` : "https://music.apple.com/library",
      name,
      addedReleases,
      totalReleases: releases.length,
      trackCount: trackData.length,
      unmatched,
    };
  },
};
