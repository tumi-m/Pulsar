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
  clearToken,
  loadDspConfig,
  readPending,
  savePending,
  type BuildResult,
  type DspProvider,
  type Pending,
  type ProgressFn,
  takeAuthError,
} from "./shared";
import { spotifyProvider, setSpotifyClientId } from "./spotify";
import { tidalProvider, setTidalClientId } from "./tidal";
import { youtubeProvider, setGoogleClientId } from "./youtube";
import { appleProvider, setAppleEnabled } from "./apple";

const PROVIDERS: Record<string, DspProvider> = {
  [spotifyProvider.key]: spotifyProvider,
  [youtubeProvider.key]: youtubeProvider,
  [appleProvider.key]: appleProvider,
  [tidalProvider.key]: tidalProvider,
};

/**
 * Pull the live DSP client configuration from the server and overlay it on the
 * build-time NEXT_PUBLIC_* inlines. Call once on boot and whenever the export
 * sheet opens — this is what makes a client id set in the Vercel dashboard
 * take effect without redeploying.
 */
export async function ensureDspConfig(force = false): Promise<void> {
  const cfg = await loadDspConfig(force);
  setSpotifyClientId(cfg.spotifyClientId);
  setGoogleClientId(cfg.googleClientId);
  setTidalClientId(cfg.tidalClientId);
  setAppleEnabled(cfg.appleEnabled);
}

/** Does this DSP support real, in-app playlist creation right now? */
export function providerConfigured(key: string): boolean {
  const p = PROVIDERS[key];
  return !!p && p.configured();
}

/**
 * Forget the stored token for a provider so the next export re-runs consent.
 * The usual reason: the user authorised with a different account than the one
 * allow-listed on the developer dashboard, so every call comes back 403 and
 * retrying with the same token can only ever fail the same way.
 */
export function disconnectProvider(key: string) {
  clearToken(key);
  clearPending();
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
  // Make sure a client id set after the last deploy is in hand before
  // redirecting out to a consent screen.
  await ensureDspConfig();
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
/** Outcome of a returning OAuth redirect that queued an export and failed. */
export interface RedirectFailure {
  failed: Pending["provider"];
  /** The provider's own reason, when it recorded one. */
  message: string | null;
}

/** Which auth-error key each export provider records its reason under. */
const AUTH_ERROR_KEY: Partial<Record<Pending["provider"], string>> = {
  spotify: "spotify",
  tidal: "tidal",
  youtube_music: "youtube",
};

export async function handleDspRedirect(): Promise<Pending | RedirectFailure | null> {
  if (typeof window === "undefined") return null;
  // `error=` counts too: a declined consent comes back with an error and no
  // code, and used to be ignored here — so no provider ever saw it, nothing
  // was recorded, and the ?error=… stayed in the address bar.
  const hasResponse =
    window.location.search.includes("code=") ||
    window.location.search.includes("error=") ||
    window.location.hash.includes("access_token=");
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
  // crate so it can't silently re-trigger an export on a later page load — and
  // report it. This returned null, so someone who went to Google or Spotify to
  // export a crate came back to a homepage with no word of what happened.
  if (pending) {
    clearPending();
    const key = AUTH_ERROR_KEY[pending.provider];
    return { failed: pending.provider, message: key ? takeAuthError(key) : null };
  }
  return null;
}

export type { BuildResult, Pending } from "./shared";
