/**
 * Pulsar — Live Music Feed
 *
 * Pulls current + genuinely new releases from FREE, keyless APIs so the
 * site self-updates daily with real artwork and platform links:
 *
 *   • Deezer editorial new releases  — this week's actual album drops
 *     https://api.deezer.com/editorial/0/releases   (no auth)
 *   • Apple Marketing Tools RSS      — most-played albums + songs now
 *     https://rss.applemarketingtools.com/api/v2/...  (no auth)
 *
 * Every source is best-effort: a dead endpoint yields fewer results,
 * never an error. Results are merged, de-duplicated, newest first.
 */

import type { Release, ReleaseType, MoodTag } from "./types";

// ── platform deep links ──────────────────────
const sp = (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}`;
const am = (q: string) => `https://music.apple.com/search?term=${encodeURIComponent(q)}`;
const td = (q: string) => `https://tidal.com/search?q=${encodeURIComponent(q)}`;
const sc = (q: string) => `https://soundcloud.com/search?q=${encodeURIComponent(q)}`;
const yt = (q: string) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`;

// Map a genre string onto one of our mood accent colors.
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

function stableId(artist: string, title: string): string {
  let h = 0;
  const s = `${artist}::${title}`.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `feed-${(h >>> 0).toString(36)}`;
}

function baseRelease(
  artist: string,
  title: string,
  type: ReleaseType,
  artworkUrl: string,
  releaseDate: string,
  genre: string | null,
  appleUrl: string | null
): Release {
  const q = `${artist} ${title}`;
  return {
    id: stableId(artist, title),
    artist,
    title,
    type,
    artwork_url: artworkUrl,
    release_date: releaseDate,
    genre,
    tags: genre ? [genre.toLowerCase()] : [],
    mood: genre ? moodFor(genre) : "cinematic",
    spotify: sp(q),
    apple_music: appleUrl ?? am(q),
    tidal: td(q),
    soundcloud: sc(q),
    youtube_music: yt(q),
    created_at: releaseDate + "T00:00:00Z",
    curator_note: null,
  };
}

const todayISO = () => new Date().toISOString().split("T")[0];

async function fetchJSON(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 1800 }, // refresh at most every 30 min
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Source 1: Deezer editorial new releases (genuinely new) ──────────
interface DeezerAlbum {
  title?: string;
  cover_xl?: string;
  cover_big?: string;
  release_date?: string;
  record_type?: string;
  artist?: { name?: string };
}

function mapDeezer(a: DeezerAlbum, popularity: number | null): Release | null {
  const artist = a.artist?.name?.trim();
  const title = a.title?.trim();
  const art = a.cover_xl ?? a.cover_big;
  if (!artist || !title || !art) return null;
  const type: ReleaseType =
    a.record_type === "single" ? "single" : a.record_type === "ep" ? "ep" : "album";
  const date =
    a.release_date && /^\d{4}-\d{2}-\d{2}$/.test(a.release_date)
      ? a.release_date
      : todayISO();
  const r = baseRelease(artist, title, type, art, date, null, null);
  if (popularity != null) r.popularity = popularity;
  return r;
}

async function fromDeezer(): Promise<Release[]> {
  const [releases, chart] = await Promise.all([
    fetchJSON("https://api.deezer.com/editorial/0/releases") as Promise<{ data?: DeezerAlbum[] } | null>,
    fetchJSON("https://api.deezer.com/chart/0/albums?limit=100") as Promise<{ data?: DeezerAlbum[] } | null>,
  ]);
  const out: Release[] = [];
  for (const a of releases?.data ?? []) {
    const r = mapDeezer(a, null);
    if (r) out.push(r);
  }
  // Chart entries carry a popularity rank: position 1 => 200, 2 => 199...
  (chart?.data ?? []).forEach((a, i) => {
    const r = mapDeezer(a, 200 - i);
    if (r) out.push(r);
  });
  return out;
}

// ── Source 2: Apple most-played albums + songs (current, popular) ────
interface AppleFeedResult {
  artistName?: string;
  name?: string;
  releaseDate?: string;
  kind?: string;
  artworkUrl100?: string;
  genres?: { name: string }[];
  url?: string;
}

const APPLE_FEEDS = [
  "https://rss.applemarketingtools.com/api/v2/us/music/most-played/100/albums.json",
  "https://rss.applemarketingtools.com/api/v2/us/music/most-played/100/songs.json",
];

function appleHiRes(url: string): string {
  return url.replace(/\/\d+x\d+bb\.(jpg|png)/, "/1500x1500bb.$1");
}

async function fromApple(): Promise<Release[]> {
  const out: Release[] = [];
  await Promise.all(
    APPLE_FEEDS.map(async (url) => {
      const data = (await fetchJSON(url)) as { feed?: { results?: AppleFeedResult[] } } | null;
      for (const r of data?.feed?.results ?? []) {
        const artist = r.artistName?.trim();
        const title = r.name?.trim();
        if (!artist || !title || !r.artworkUrl100) continue;
        const type: ReleaseType = r.kind?.includes("song") ? "single" : "album";
        const genre =
          r.genres?.map((g) => g.name).find((n) => n && n !== "Music") ?? null;
        const date =
          r.releaseDate && /^\d{4}-\d{2}-\d{2}$/.test(r.releaseDate)
            ? r.releaseDate
            : todayISO();
        const rel = baseRelease(
          artist, title, type, appleHiRes(r.artworkUrl100), date, genre, r.url ?? null
        );
        // Feed order IS the most-played chart: rank 1 => 200, 2 => 199...
        rel.popularity = 200 - out.length;
        out.push(rel);
      }
    })
  );
  return out;
}

/**
 * Fetch the live feed. Returns a de-duplicated, newest-first Release[].
 * Never throws — on total failure it returns an empty array.
 */
export async function getLiveFeed(): Promise<Release[]> {
  const [deezer, apple] = await Promise.all([fromDeezer(), fromApple()]);
  console.log(
    `[feed] deezer new releases: ${deezer.length} · apple most-played: ${apple.length}`
  );

  const seen = new Set<string>();
  const all: Release[] = [];
  const byKey = new Map<string, Release>();
  for (const r of [...deezer, ...apple]) {
    const key = `${r.artist.toLowerCase()}::${r.title.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, r);
      all.push(r);
    } else if ((r.popularity ?? -1) > (existing.popularity ?? -1)) {
      existing.popularity = r.popularity; // keep strongest chart signal
    }
  }
  void seen;

  return all.sort((a, b) => (a.release_date < b.release_date ? 1 : -1));
}
