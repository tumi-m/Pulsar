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

// A working release that remembers its Deezer album id (so we can look up the
// real release date later) and whether it still needs a real date.
type FeedRelease = Release & { _dz?: number; _noDate?: boolean };

// ── Source 1: Deezer editorial new releases (genuinely new) ──────────
interface DeezerAlbum {
  id?: number;
  title?: string;
  cover_xl?: string;
  cover_big?: string;
  release_date?: string;
  record_type?: string;
  artist?: { name?: string };
}

function mapDeezer(a: DeezerAlbum, popularity: number | null): FeedRelease | null {
  const artist = a.artist?.name?.trim();
  const title = a.title?.trim();
  const art = a.cover_xl ?? a.cover_big;
  if (!artist || !title || !art) return null;
  const type: ReleaseType =
    a.record_type === "single" ? "single" : a.record_type === "ep" ? "ep" : "album";
  // Deezer's /chart endpoints DON'T include release_date — only /editorial and
  // /album/{id} do. Mark those so we can back-fill the REAL date afterwards
  // instead of pretending everything dropped today.
  const hasRealDate = Boolean(a.release_date && /^\d{4}-\d{2}-\d{2}$/.test(a.release_date));
  const date = hasRealDate ? a.release_date! : todayISO();
  const r = baseRelease(artist, title, type, art, date, null, null) as FeedRelease;
  if (popularity != null) r.popularity = popularity;
  if (a.id) r._dz = a.id;
  if (!hasRealDate) r._noDate = true;
  return r;
}

// ── Back-fill true release dates from the Deezer album detail endpoint ──
interface DeezerAlbumDetail {
  release_date?: string;
  genres?: { data?: { name?: string }[] };
}

/**
 * For albums whose date we couldn't read from the list endpoint, fetch the
 * album detail (which carries the REAL release_date) and patch it in. Bounded
 * by concurrency + a cap; the highest-charting albums are enriched first so
 * the visible catalogue gets true dates. Anything left undated is flagged so
 * it never masquerades as a brand-new "latest" drop.
 */
async function enrichRealDates(list: FeedRelease[]): Promise<void> {
  const need = list
    .filter((r) => r._noDate && r._dz)
    .sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1));
  const CAP = 1200;
  const targets = need.slice(0, CAP);
  const CONC = 24;
  let idx = 0;
  let filled = 0;

  const worker = async () => {
    while (idx < targets.length) {
      const r = targets[idx++];
      const detail = (await fetchJSON(
        `https://api.deezer.com/album/${r._dz}`
      )) as DeezerAlbumDetail | null;
      const d = detail?.release_date;
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        r.release_date = d;
        r.created_at = d + "T00:00:00Z";
        r._noDate = false;
        filled++;
        const g = detail?.genres?.data?.[0]?.name;
        if (g && !r.genre) {
          r.genre = g;
          r.tags = [g.toLowerCase()];
          r.mood = moodFor(g);
        }
      }
    }
  };

  await Promise.all(Array.from({ length: CONC }, worker));
  console.log(`[feed] real dates back-filled: ${filled}/${targets.length} (missing ${need.length})`);
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

// ── Source 1b: every genre's chart + editorial (thousands of albums) ──
async function fromDeezerGenres(): Promise<Release[]> {
  const genres = (await fetchJSON("https://api.deezer.com/genre")) as {
    data?: { id: number; name: string }[];
  } | null;
  const ids = (genres?.data ?? []).map((g) => g.id).filter((id) => id > 0).slice(0, 24);
  const out: Release[] = [];
  await Promise.all(
    ids.map(async (id) => {
      const [chart, editorial] = await Promise.all([
        fetchJSON(`https://api.deezer.com/chart/${id}/albums?limit=100`) as Promise<{ data?: DeezerAlbum[] } | null>,
        fetchJSON(`https://api.deezer.com/editorial/${id}/releases?limit=100`) as Promise<{ data?: DeezerAlbum[] } | null>,
      ]);
      for (const a of chart?.data ?? []) {
        const r = mapDeezer(a, null);
        if (r) out.push(r);
      }
      for (const a of editorial?.data ?? []) {
        const r = mapDeezer(a, null);
        if (r) out.push(r);
      }
    })
  );
  return out;
}

// ── Source 1c: African & South African music (Deezer artist search) ──
// A broad, keyless sweep of prominent African/SA artists so the catalogue
// carries hundreds of Afrobeats / Amapiano / SA-house / kwaito releases.
const AFRICA_ARTISTS = [
  // Afrobeats / Nigeria & West Africa
  "Burna Boy", "Wizkid", "Davido", "Tems", "Rema", "Asake", "Ayra Starr",
  "Fireboy DML", "Omah Lay", "Tiwa Savage", "Yemi Alade", "Mr Eazi",
  "Wande Coal", "Olamide", "Adekunle Gold", "Simi", "CKay", "Joeboy",
  "Ruger", "Kizz Daniel", "Patoranking", "Flavour", "Mr Eazi",
  // Amapiano / South Africa
  "Kabza De Small", "DJ Maphorisa", "Focalistic", "Uncle Waffles",
  "Musa Keys", "Tyler ICU", "Daliwonga", "Young Stunna", "Kelvin Momo",
  "Mellow & Sleazy", "Nkosazana Daughter", "Sha Sha", "Zakes Bantwini",
  "Master KG", "Nomcebo Zikode", "Makhadzi", "DBN Gogo",
  // SA house / hip-hop / soul
  "Black Coffee", "Sun-El Musician", "Nasty C", "Cassper Nyovest", "AKA",
  "Emtee", "Kwesta", "Sjava", "Zonke", "Msaki", "Amanda Black", "Zahara",
  "Mafikizolo", "Sho Madjozi", "Tyla", "Elaine", "Lloyiso",
  // Legends & pan-African
  "Fela Kuti", "Miriam Makeba", "Hugh Masekela", "Brenda Fassie",
  "Lucky Dube", "Ladysmith Black Mambazo", "Angelique Kidjo",
  "Youssou N'Dour", "Salif Keita", "Diamond Platnumz", "Sauti Sol",
];

async function fromAfrica(): Promise<Release[]> {
  const out: Release[] = [];
  await Promise.all(
    AFRICA_ARTISTS.map(async (name) => {
      const q = encodeURIComponent(`artist:"${name}"`);
      const data = (await fetchJSON(
        `https://api.deezer.com/search/album?q=${q}&limit=10&order=RANKING`
      )) as { data?: DeezerAlbum[] } | null;
      for (const a of data?.data ?? []) {
        const r = mapDeezer(a, null);
        if (r) out.push(r);
      }
    })
  );
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
  const [deezer, apple, genres, africa] = await Promise.all([
    fromDeezer(),
    fromApple(),
    fromDeezerGenres(),
    fromAfrica(),
  ]);
  console.log(
    `[feed] deezer: ${deezer.length} · apple: ${apple.length} · genres: ${genres.length} · africa: ${africa.length}`
  );

  const all: FeedRelease[] = [];
  const byKey = new Map<string, FeedRelease>();
  // Apple + deezer chart first (best popularity signal), then the genre sweep
  // and the African / South African sweep.
  for (const r of [...apple, ...deezer, ...genres, ...africa] as FeedRelease[]) {
    const key = `${r.artist.toLowerCase()}::${r.title.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, r);
      all.push(r);
    } else {
      if ((r.popularity ?? -1) > (existing.popularity ?? -1)) {
        existing.popularity = r.popularity; // keep strongest chart signal
      }
      // Prefer a copy that actually knows its real (or lookup-able) date.
      if (existing._noDate && !r._noDate) {
        existing.release_date = r.release_date;
        existing.created_at = r.created_at;
        existing._noDate = false;
      } else if (existing._noDate && r._dz && !existing._dz) {
        existing._dz = r._dz; // remember an id we can look the date up with
      }
    }
  }

  // Back-fill true release dates for the charted albums that arrived undated.
  await enrichRealDates(all);

  // Sort newest-first by REAL date; albums we still couldn't date are pushed
  // below the dated ones so they never sit at the top of "Latest".
  all.sort((a, b) => {
    if (Boolean(a._noDate) !== Boolean(b._noDate)) return a._noDate ? 1 : -1;
    return a.release_date < b.release_date ? 1 : -1;
  });

  // Drop the internal bookkeeping fields before handing back clean Releases.
  return all.map(({ _dz, _noDate, ...r }) => {
    void _dz;
    void _noDate;
    return r;
  });
}
