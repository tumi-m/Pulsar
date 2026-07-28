/**
 * DSP playlist-creation registry.
 *
 * `exportCrate(key, …)` builds a real playlist on the chosen service when a
 * provider exists and is configured; the caller falls back to CSV import
 * otherwise (or when creation throws). `handleDspRedirect()` runs on app boot to
 * finish any OAuth round-trip and hand back the crate that was mid-export.
 */

import type { Release } from "../types";
import {
  clearPending,
  readPending,
  savePending,
  type BuildResult,
  type DspProvider,
  type Pending,
  type ProgressFn,
} from "./shared";
import { spotifyProvider } from "./spotify";
import { youtubeProvider } from "./youtube";
import { appleProvider } from "./apple";

const PROVIDERS: Record<string, DspProvider> = {
  [spotifyProvider.key]: spotifyProvider,
  [youtubeProvider.key]: youtubeProvider,
  [appleProvider.key]: appleProvider,
};

/** Does this DSP support real, in-app playlist creation right now? */
export function providerConfigured(key: string): boolean {
  const p = PROVIDERS[key];
  return !!p && p.configured();
}

/**
 * Build a playlist on `key`. For redirect-based providers that aren't yet
 * authorised, stashes the crate and returns "redirecting" (the build resumes
 * after consent via handleDspRedirect). Throws on a real failure so the caller
 * can fall back to CSV.
 */
export async function exportCrate(
  key: string,
  name: string,
  releases: Release[],
  onProgress?: ProgressFn
): Promise<BuildResult | "redirecting"> {
  const provider = PROVIDERS[key];
  if (!provider) throw new Error(`No playlist provider for ${key}`);
  // Remember what we're building so we can resume after an OAuth redirect.
  savePending({ provider: key, name, releases });
  const result = await provider.createPlaylist(name, releases, onProgress);
  if (result !== "redirecting") clearPending();
  return result;
}

/**
 * On app boot: if we've returned from a provider's OAuth consent screen, finish
 * the token exchange and return the crate that was pending so the UI can resume
 * building it. Returns null when there's nothing to resume.
 */
export async function handleDspRedirect(): Promise<Pending | null> {
  if (typeof window === "undefined") return null;
  const hasResponse =
    window.location.search.includes("code=") || window.location.hash.includes("access_token=");
  if (!hasResponse) return null;

  const pending = readPending();

  // Complete the exchange even when the pending crate was lost (cleared
  // storage, a different tab, ITP). Otherwise the authorisation code would be
  // discarded, the token never saved, and every future export would bounce the
  // user to Spotify again in a loop. Each provider checks the `state` parameter
  // to decide whether the response belongs to it.
  for (const provider of Object.values(PROVIDERS)) {
    if (!provider.completeRedirect) continue;
    const ok = await provider.completeRedirect();
    if (!ok) continue;
    // Authorised. Resume the build only if this is the crate we queued.
    if (pending && pending.provider === provider.key) return pending;
    clearPending();
    return null; // connected, but nothing to resume — the next click just works
  }

  // Nobody claimed it: consent denied, or the exchange failed. Drop the pending
  // crate so it can't silently re-trigger an export on a later page load.
  if (pending) clearPending();
  return null;
}

export type { BuildResult, Pending } from "./shared";
