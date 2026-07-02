/**
 * Pulsar — Live Music Feed
 *
 * Pulls genuinely new releases from Apple's Marketing Tools RSS feeds.
 * These are FREE and require NO API KEY, so the site self-updates daily
 * with real artwork, real Apple Music links, genre, and release date.
 * The four remaining platform links are deep search links to the exact
 * release. Results are cached (ISR) and merged with Supabase + catalog.
 */

import type { Release, ReleaseType, MoodTag } from "./types";

// Apple Marketing Tools RSS — no auth required. We try several feeds and
// merge whatever succeeds, so a single dead endpoint never breaks the site.
const FEED_URLS = [
  "https://rss.applemarketingtools.com/api/v2/us/music/most-recent/100/albums.json",
  "https://rss.applemarketingtools.com/api/v2/us/music/most-recent/100/songs.json",
];

interface AppleFeedResult {
  artistName?: string;
  name?: string;
  releaseDate?: string;
  kind?: string;
  artworkUrl100?: string;
  genres?: { name: string }[];
  url?: string;
}

// ── platform deep links ──────────────────────
const sp = (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}`;
const td = (q: string) => `https://tidal.com/search?q=${encodeURIComponent(q)}`;
const sc = (q: string) => `https://soundcloud.com/search?q=${encodeURIComponent(q)}`;
const yt = (q: string) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`;

// Map an Apple genre string onto one of our mood accent colors.
const GENRE_MOOD: Record<string, MoodTag> = {
  "hip-hop/rap": "energetic",
  "hip hop/rap": "energetic",
  rap: "energetic",
  electronic: "hypnotic",
  dance: "euphoric",
  pop: "euphoric",
  "r&b/soul": "melancholic",
  "r&b": "melancholic",
  soul: "melancholic",
  alternative: "raw",
  rock: "raw",
  metal: "raw",
  indie: "cinematic",
  jazz: "ambient",
  classical: "ambient",
  ambient: "ambient",
  country: "tender",
  folk: "tender",
  singer: "tender",
};

function moodFor(genre: string): MoodTag {
  const g = genre.toLowerCase();
  for (const key of Object.keys(GENRE_MOOD)) {
    if (g.includes(key)) return GENRE_MOOD[key];
  }
  return "cinematic";
}

function hiResArtwork(url: string): string {
  // Apple thumbnails end in /{w}x{h}bb.jpg — request a large, crisp version.
  return url.replace(/\/\d+x\d+bb\.(jpg|png)/, "/1500x1500bb.$1");
}

function stableId(artist: string, title: string): string {
  let h = 0;
  const s = `${artist}::${title}`.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `feed-${(h >>> 0).toString(36)}`;
}

function mapResult(r: AppleFeedResult): Release | null {
  const artist = r.artistName?.trim();
  const title = r.name?.trim();
  if (!artist || !title || !r.artworkUrl100) return null;

  const type: ReleaseType = r.kind?.includes("song") ? "single" : "album";
  const genre =
    r.genres?.map((g) => g.name).find((n) => n && n !== "Music") ?? "Music";
  const q = `${artist} ${title}`;
  const releaseDate =
    r.releaseDate && /^\d{4}-\d{2}-\d{2}$/.test(r.releaseDate)
      ? r.releaseDate
      : new Date().toISOString().split("T")[0];

  return {
    id: stableId(artist, title),
    artist,
    title,
    type,
    artwork_url: hiResArtwork(r.artworkUrl100),
    release_date: releaseDate,
    genre,
    tags: r.genres?.map((g) => g.name.toLowerCase()).filter((n) => n !== "music") ?? [],
    mood: moodFor(genre),
    spotify: sp(q),
    apple_music: r.url ?? null,
    tidal: td(q),
    soundcloud: sc(q),
    youtube_music: yt(q),
    created_at: releaseDate + "T00:00:00Z",
    curator_note: null,
  };
}

/**
 * Fetch the live feed. Returns a de-duplicated, newest-first Release[].
 * Never throws — on total failure it returns an empty array.
 */
export async function getLiveFeed(): Promise<Release[]> {
  const all: Release[] = [];
  const seen = new Set<string>();

  await Promise.all(
    FEED_URLS.map(async (url) => {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(8000),
          next: { revalidate: 1800 }, // refresh at most every 30 min
        });
        if (!res.ok) return;
        const data = await res.json();
        const results: AppleFeedResult[] = data?.feed?.results ?? [];
        for (const r of results) {
          const mapped = mapResult(r);
          if (!mapped) continue;
          const key = `${mapped.artist.toLowerCase()}::${mapped.title.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          all.push(mapped);
        }
      } catch {
        // ignore a single dead feed
      }
    })
  );

  return all.sort((a, b) => (a.release_date < b.release_date ? 1 : -1));
}
