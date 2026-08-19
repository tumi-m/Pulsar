/**
 * Curated playback data for the sample feature.
 *
 * WHY THIS FILE EXISTS
 *
 * The feature kept failing because every play depended on resolving a YouTube
 * video id at request time by regex-scraping youtube.com/results from a
 * serverless function. Vercel egresses from datacenter IPs, YouTube answers
 * those with a consent interstitial — served as HTTP 200, so the route's
 * `!res.ok` guard never fired — the regex matched nothing, and the endpoint
 * returned `{videoId: null}`, identical to "this record genuinely has no
 * video". The player never mounted and the user saw "No video found" forever.
 *
 * YouTube's own no-key escape hatch is gone: `embed?listType=search&list=…`
 * would have played the top result for a query with no id and no API key, but
 * it has returned 404/410 since 15 November 2020, and Google's docs now direct
 * you to `search.list` instead.
 * https://developers.google.com/youtube/player_parameters
 *
 * So the fix is to stop resolving at request time. A video id pinned here is a
 * fact that cannot fail at runtime — no network, no quota, no consent wall.
 *
 * PINNING RULES — a wrong id is worse than no id, because it silently plays the
 * wrong record to someone trying to hear a specific sample:
 *   - Only add an id somebody has actually opened and watched.
 *   - Prefer official artist/label uploads; they are least likely to be deleted.
 *   - `npm run verify:videos` re-checks every pin against YouTube's oEmbed
 *     endpoint. Note oEmbed proves a video EXISTS and is public — it cannot
 *     prove it is embeddable, so the player still needs its own error path.
 *   - When in doubt, leave it out. An empty map degrades to a search link,
 *     which is honest; a wrong pin is a bug nobody reports because it looks
 *     like it worked.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

/** Stable key for one record. */
export function trackKey(artist: string, title: string): string {
  return `${norm(artist)}::${norm(title)}`;
}

export const isVideoId = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{11}$/.test(v);

/**
 * Hand-checked YouTube ids, keyed by `trackKey(artist, title)`.
 *
 * Deliberately empty right now. This session could not reach youtube.com — the
 * egress proxy refuses it — so there was no way to open a candidate video and
 * confirm it is the right record. Populating it from memory would have shipped
 * plausible-looking ids that play the wrong song, which is the one failure mode
 * this whole redesign exists to prevent.
 *
 * To fill it: run `npm run pin:videos`, which walks the unpinned records and
 * takes a pasted URL for each, then `npm run verify:videos`.
 */
export const TRACK_VIDEOS: Record<string, string> = {};

/** The pinned id for a record, or null. Never guesses. */
export function pinnedVideoId(artist: string, title: string): string | null {
  const id = TRACK_VIDEOS[trackKey(artist, title)];
  return isVideoId(id) ? id : null;
}

/** ── timings ─────────────────────────────────────────────────── */

export type TimingProvenance =
  /** Someone played the pinned upload and marked both ends by ear. */
  | "editor"
  /** Taken from a published research dataset, accurate to a couple of seconds. */
  | "dataset";

export interface SampleTiming {
  /** Seconds into the record that CONTAINS the sample. */
  inSong?: number;
  /** Seconds into the SOURCE record where the lifted section begins. */
  inSource?: number;
  /** ± accuracy in seconds. 0 for editor marks against a known upload. */
  toleranceSec: number;
  /** Where this came from — rendered in the UI, never hidden. */
  provenance: TimingProvenance;
  /** Citation or the editor's note. Required. */
  source: string;
}

/** Keyed by `connectionKey(...)`. */
export const SAMPLE_TIMINGS: Record<string, SampleTiming> = {};

/** Stable key for one directed connection: song → source. */
export function connectionKey(
  artist: string,
  title: string,
  sourceArtist: string,
  sourceTitle: string
): string {
  return `${trackKey(artist, title)}>>${trackKey(sourceArtist, sourceTitle)}`;
}

export function lookupTiming(
  artist: string,
  title: string,
  sourceArtist: string,
  sourceTitle: string
): SampleTiming | null {
  return SAMPLE_TIMINGS[connectionKey(artist, title, sourceArtist, sourceTitle)] ?? null;
}

/** How many connections ship a real timing — drives the UI's honest copy. */
export function timedConnectionCount(): number {
  return Object.keys(SAMPLE_TIMINGS).length;
}

export const formatTimecode = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** "1:15" → 75. Returns null on anything unparseable. */
export function parseTimecode(value: string): number | null {
  const parts = value.trim().split(":").map(Number);
  if (!parts.length || parts.some((n) => Number.isNaN(n) || n < 0)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** The YouTube search a listener falls back to when nothing is pinned. */
export function youtubeSearchUrl(artist: string, title: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${title}`)}`;
}
