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
  const pending = readPending();
  const hasResponse =
    window.location.search.includes("code=") || window.location.hash.includes("access_token=");
  if (!pending || !hasResponse) return null;

  const provider = PROVIDERS[pending.provider];
  if (!provider?.completeRedirect) return null;
  const ok = await provider.completeRedirect();
  if (!ok) return null;
  return pending; // caller re-runs exportCrate(pending.provider, …), now authorised
}

export type { BuildResult, Pending } from "./shared";
