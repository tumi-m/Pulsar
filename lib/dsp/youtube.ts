/**
 * YouTube Music — Google OAuth (Authorization Code + PKCE) + YouTube Data API v3.
 *
 * Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID (public) and GOOGLE_CLIENT_SECRET
 * (server-only, used by /api/youtube-token) from a Google Cloud OAuth
 * "Web application" whose authorised JavaScript origin and redirect URI are
 * this site's origin. The `youtube` scope is sensitive, so for public use the
 * consent screen must be verified by Google.
 *
 * Note: each track search costs 100 quota units (default 10k/day ≈ 100 lookups).
 */

import type { Release } from "../types";
import {
  base64url,
  cleanUrl,
  clearToken,
  randomString,
  readToken,
  redirectUri,
  saveToken,
  searchTerm,
  plainTitle,
  sha256,
  type BuildResult,
  type DspProvider,
  type ProgressFn,
  newOAuthState,
  checkOAuthState,
  setAuthError,
  takeAuthError,
} from "./shared";

// Build-time inline, overlaid at runtime by /api/dsp-config (see
// ensureDspConfig in ./index.ts) so setting the env var works without a
// redeploy.
let CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
export function setGoogleClientId(id: string) {
  if (id) CLIENT_ID = id;
}
const SCOPE = "https://www.googleapis.com/auth/youtube";
const VERIFIER_KEY = "pulsar_youtube_verifier";

// Mirrored into localStorage because some mobile browsers drop sessionStorage
// across the OAuth round-trip, which would strand the user in a redirect loop.
function setVerifier(v: string) {
  try {
    sessionStorage.setItem(VERIFIER_KEY, v);
    localStorage.setItem(VERIFIER_KEY, v);
  } catch {
    /* storage unavailable */
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

/**
 * Authorization Code + PKCE.
 *
 * NOT the implicit flow: Google deprecated `response_type=token` and no longer
 * supports it for new integrations, so a freshly-created OAuth client cannot
 * use it at all. The code is exchanged for a token by /api/youtube-token,
 * because Google's Web-application client type requires the client secret on
 * the exchange and a secret must never reach the browser.
 */
async function beginAuth() {
  const verifier = randomString(48);
  const challenge = base64url(await sha256(verifier));
  setVerifier(verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    state: newOAuthState("youtube"),
    include_granted_scopes: "true",
    prompt: "consent",
    access_type: "online",
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Fatal for the whole export — callers must stop rather than skip a track. */
class YouTubeFatalError extends Error {}

async function errorReason(res: Response): Promise<string> {
  try {
    const body = await res.clone().json();
    return body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? "";
  } catch {
    return "";
  }
}

async function api(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`https://www.googleapis.com/youtube/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    const reason = await errorReason(res);
    if (/youtubeSignupRequired/i.test(reason)) {
      // Not an expired session: this Google account has no YouTube channel, so
      // it can't own a playlist. Calling it "expired" sent people round the
      // consent screen in a loop, spending quota each time.
      throw new YouTubeFatalError(
        "This Google account doesn't have a YouTube channel yet, so it can't own a playlist. " +
          "Create one at youtube.com/create_channel, then export again."
      );
    }
    clearToken("youtube");
    throw new YouTubeFatalError("YouTube session expired — reconnect to continue.");
  }
  if (res.status === 403) {
    // The YouTube Data API is quota-metered: a search costs 100 units against
    // a 10,000/day default shared by the whole project.
    const reason = await errorReason(res);
    if (/quota/i.test(reason)) {
      throw new YouTubeFatalError(
        "YouTube's daily API quota is used up (about 65 records a day across everyone using " +
          "this Pulsar). It resets at midnight Pacific time; the owner can request more in Google Cloud."
      );
    }
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason)) {
      throw new YouTubeFatalError(
        "The YouTube Data API v3 isn't enabled in this app's Google Cloud project. The site " +
          "owner needs to enable it, then you can export again."
      );
    }
    throw new YouTubeFatalError(
      "YouTube refused the request. If the app isn't verified by Google yet, add this " +
        "account as a test user on the OAuth consent screen."
    );
  }
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  return res.json();
}

const norm = (x: string) =>
  x
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Is this search hit plausibly the record? The video title should contain the
 * song title, and the artist should appear in the video title or be the
 * channel ("Artist - Topic", "ArtistVEVO"). The top hit used to be taken
 * whatever it was.
 */
function looksLikeRecord(r: Release, snippet: { title?: string; channelTitle?: string } | undefined): boolean {
  const title = norm(plainTitle(r));
  const artist = norm(r.artist);
  const vt = norm(snippet?.title ?? "");
  const ch = norm(snippet?.channelTitle ?? "");
  if (!title || !vt.includes(title)) return false;
  return Boolean(artist) && (vt.includes(artist) || ch.includes(artist) || artist.includes(ch.replace(/topic$|vevo$/, "")));
}

async function videoIdFor(r: Release, token: string): Promise<string | null> {
  const q = encodeURIComponent(searchTerm(r));
  // videoCategoryId=10 is YouTube's Music category; five results so one can be
  // checked against the record. A search costs the same 100 units at any size.
  const found = await api(
    `/search?part=snippet&type=video&videoCategoryId=10&maxResults=5&q=${q}`,
    token
  );
  const items = (found?.items ?? []) as { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[];
  return items.find((it) => looksLikeRecord(r, it.snippet))?.id?.videoId ?? null;
}

export const youtubeProvider: DspProvider = {
  key: "youtube_music",
  label: "YouTube Music",
  configured: () => CLIENT_ID.length > 0,

  async createPlaylist(name, releases, onProgress?: ProgressFn): Promise<BuildResult | "redirecting"> {
    const token = readToken("youtube", 5 * 60_000); // enough to outlast a big crate
    if (!token) {
      // A failed sign-in left a reason: show it rather than bouncing the user
      // back to Google's consent screen, which is what made this a loop.
      const authErr = takeAuthError("youtube");
      if (authErr) throw new Error(authErr);
      beginAuth();
      return "redirecting";
    }
    // Search and add as we go, creating the playlist at the FIRST match. The
    // project's whole daily quota is ~65 records (100 units per search, 50 per
    // add), so searching an entire large crate before creating anything — the
    // previous order — spent it all on searches and created nothing. Adding as
    // we go keeps what was built when the quota runs out, and creating only at
    // the first match still means a crate with no matches creates nothing.
    let playlistId: string | null = null;
    let trackCount = 0;
    let matchedReleases = 0;
    let lookupErrors = 0;
    let insertFailures = 0;
    let note: string | undefined;
    const unmatched: string[] = [];
    const added = new Set<string>();

    for (let i = 0; i < releases.length; i++) {
      const r = releases[i];
      try {
        const videoId = await videoIdFor(r, token.access_token);
        if (!videoId) {
          unmatched.push(`${r.artist} — ${r.title}`);
        } else if (!added.has(videoId)) {
          if (!playlistId) {
            const playlist = await api("/playlists?part=snippet,status", token.access_token, {
              method: "POST",
              body: JSON.stringify({
                // YouTube caps titles at 150 characters.
                snippet: { title: name.slice(0, 150), description: "Made with Pulsar — music discovery." },
                status: { privacyStatus: "private" },
              }),
            });
            if (!playlist?.id) throw new Error("YouTube didn't return a playlist.");
            playlistId = playlist.id as string;
          }
          try {
            await api("/playlistItems?part=snippet", token.access_token, {
              method: "POST",
              body: JSON.stringify({
                snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } },
              }),
            });
            added.add(videoId);
            trackCount++;
            matchedReleases++;
          } catch (e) {
            if (e instanceof YouTubeFatalError) throw e;
            insertFailures++;
          }
        }
      } catch (e) {
        if (e instanceof YouTubeFatalError) {
          // Keep what was built: the playlist exists and holds what was added.
          if (playlistId && trackCount > 0) {
            note = `Stopped after ${i} of ${releases.length} records: ${e.message}`;
            break;
          }
          throw e;
        }
        lookupErrors++;
      }
      onProgress?.(i + 1, releases.length);
    }

    if (!playlistId || trackCount === 0) {
      if (lookupErrors > 0 && unmatched.length === 0) {
        throw new Error("Couldn't reach YouTube to look the records up. Check your connection and try again.");
      }
      if (insertFailures > 0) {
        throw new Error("YouTube created the playlist but wouldn't add any videos to it. Try again in a moment.");
      }
      throw new Error(
        `None of the ${releases.length} record${releases.length === 1 ? "" : "s"} could be found on YouTube, so no playlist was created.`
      );
    }
    if (!note && insertFailures > 0) {
      note = `${insertFailures} video${insertFailures === 1 ? "" : "s"} couldn't be added.`;
    }
    return {
      provider: "youtube_music",
      url: `https://music.youtube.com/playlist?list=${playlistId}`,
      name,
      addedReleases: matchedReleases,
      totalReleases: releases.length,
      trackCount,
      note,
      unmatched,
    };
  },

  disconnect() {
    clearToken("youtube");
    clearVerifier();
  },

  async completeRedirect(): Promise<boolean> {
    const url = new URL(window.location.href);
    const stateCheck = checkOAuthState("youtube", url.searchParams.get("state"));
    if (stateCheck === "other") return false;
    if (stateCheck === "mismatch") {
      // Not a sign-in this browser started. Don't spend the code.
      cleanUrl();
      clearVerifier();
      setAuthError("youtube", "YouTube sign-in couldn't be verified. Please try exporting again.");
      return false;
    }

    const oauthError = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const verifier = getVerifier();
    cleanUrl(); // tidy the address bar whatever the outcome

    // Every failure below used to be a bare `return false`: no message, and on
    // a failed exchange the spent verifier was left behind. The export then
    // found no token and sent the user straight back to Google's consent
    // screen — a silent loop with no way to learn what was wrong. Each exit
    // now leaves a reason the export surfaces instead of redirecting again.
    if (oauthError) {
      setAuthError(
        "youtube",
        oauthError === "access_denied"
          ? "YouTube sign-in was cancelled. Export again to retry."
          : `Google refused the sign-in ("${oauthError}"). Check the OAuth client's authorised redirect URI is exactly ${redirectUri()}.`
      );
      clearVerifier();
      return false;
    }
    if (!code || !verifier) {
      setAuthError("youtube", "YouTube sign-in didn't complete (the browser lost its sign-in state). Please try again.");
      clearVerifier();
      return false;
    }

    try {
      const res = await fetch("/api/youtube-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, verifier, redirectUri: redirectUri() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.access_token) {
        setAuthError(
          "youtube",
          `YouTube sign-in failed: ${data.error || `the token exchange returned ${res.status}`}.`
        );
        return false;
      }
      saveToken("youtube", data.access_token, data.expires_in ?? 3600);
      return true;
    } catch {
      setAuthError("youtube", "YouTube sign-in failed: couldn't reach the server to finish it. Please try again.");
      return false;
    } finally {
      // A verifier is single-use. Leaving a spent one behind poisoned the next attempt.
      clearVerifier();
    }
  },
};
