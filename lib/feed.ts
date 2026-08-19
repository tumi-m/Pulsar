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
import { artistMatches } from "./match";
import { GRAMMY_ARTISTS_UNIQUE } from "./grammy-artists";
import { WORLD_ARTISTS_FLAT } from "./world-artists";

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
  gospel: "euphoric",
  worship: "tender",
  praise: "euphoric",
  amapiano: "hypnotic",
  afrobeat: "euphoric",
  reggae: "euphoric",
  latin: "euphoric",
};

function moodFor(genre: string): MoodTag {
  const g = genre.toLowerCase();
  for (const key of Object.keys(GENRE_MOOD)) {
    if (g.includes(key)) return GENRE_MOOD[key];
  }
  return "cinematic";
}

export function stableId(artist: string, title: string): string {
  // Two independent hashes (different multipliers/seeds) plus the input length.
  // A single 32-bit hash collides at a realistic rate once the catalogue runs to
  // tens of thousands of releases, and a collision means two different albums
  // share a React key — one tile silently disappears.
  const s = `${artist}::${title}`.toLowerCase();
  let h1 = 0;
  let h2 = 0x9e3779b9 | 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (Math.imul(31, h1) + c) | 0;
    h2 = (Math.imul(0x85ebca6b, h2 ^ c) + 1) | 0;
  }
  return `feed-${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${s.length.toString(36)}`;
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

export function mapDeezer(a: DeezerAlbum, popularity: number | null): FeedRelease | null {
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
  const CAP = 2500;
  const targets = need.slice(0, CAP);
  const CONC = 32;
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
  const ids = (genres?.data ?? []).map((g) => g.id).filter((id) => id > 0).slice(0, 29);
  const out: Release[] = [];
  // Deezer caps a page at 100, so walk several pages per genre. This is what
  // takes the catalogue from hundreds into the thousands.
  const PAGES = [0, 100, 200, 300];
  await Promise.all(
    ids.map(async (id) => {
      const reqs: Promise<{ data?: DeezerAlbum[] } | null>[] = [
        fetchJSON(`https://api.deezer.com/chart/${id}/albums?limit=100`) as Promise<{ data?: DeezerAlbum[] } | null>,
      ];
      for (const index of PAGES) {
        reqs.push(
          fetchJSON(
            `https://api.deezer.com/editorial/${id}/releases?limit=100&index=${index}`
          ) as Promise<{ data?: DeezerAlbum[] } | null>
        );
      }
      const pages = await Promise.all(reqs);
      for (const page of pages) {
        for (const a of page?.data ?? []) {
          const r = mapDeezer(a, null);
          if (r) out.push(r);
        }
      }
    })
  );
  return out;
}

// ── Source 1e: top artists per genre → their catalogues ──────────────
// Deezer exposes the leading artists in every genre; pulling each one's albums
// adds thousands of real releases across the whole spectrum of music.
async function fromGenreArtists(): Promise<Release[]> {
  const genres = (await fetchJSON("https://api.deezer.com/genre")) as {
    data?: { id: number; name: string }[];
  } | null;
  const ids = (genres?.data ?? []).map((g) => g.id).filter((id) => id > 0).slice(0, 29);

  // Collect the top artists across every genre first.
  const artistIds = new Set<number>();
  await Promise.all(
    ids.map(async (id) => {
      const chart = (await fetchJSON(
        `https://api.deezer.com/chart/${id}/artists?limit=50`
      )) as { data?: { id?: number }[] } | null;
      for (const a of chart?.data ?? []) if (a.id) artistIds.add(a.id);
    })
  );

  // Then fan out over their discographies with a bounded worker pool so we
  // never open hundreds of sockets at once.
  const targets = [...artistIds];
  const out: Release[] = [];
  const CONC = 20;
  const DEADLINE = Date.now() + 15_000; // same wall-clock guard as the Grammy sweep
  let idx = 0;
  const worker = async () => {
    while (idx < targets.length) {
      if (Date.now() > DEADLINE) return;
      const artistId = targets[idx++];
      const albums = (await fetchJSON(
        `https://api.deezer.com/artist/${artistId}/albums?limit=50`
      )) as { data?: DeezerAlbum[] } | null;
      for (const a of albums?.data ?? []) {
        const r = mapDeezer(a, null);
        if (r) out.push(r);
      }
    }
  };
  await Promise.all(Array.from({ length: CONC }, worker));
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
        `https://api.deezer.com/search/album?q=${q}&limit=40&order=RANKING`
      )) as { data?: DeezerAlbum[] } | null;
      for (const a of data?.data ?? []) {
        const r = mapDeezer(a, null);
        if (r) out.push(r);
      }
    })
  );
  return out;
}

// ── Source 1d: Gospel & worship (global + South African) ─────────────
// A curated, keyless sweep so the catalogue always carries gospel — from
// contemporary worship to SA gospel legends. Releases are tagged "Gospel" so
// they filter cleanly under the Gospel bucket.
const GOSPEL_ARTISTS = [
  // Global gospel / worship / CCM
  "Kirk Franklin", "Tasha Cobbs Leonard", "CeCe Winans", "Marvin Sapp",
  "Fred Hammond", "Donnie McClurkin", "Yolanda Adams", "Travis Greene",
  "Tamela Mann", "William McDowell", "Jonathan McReynolds", "Maverick City Music",
  "Elevation Worship", "Hillsong Worship", "Bethel Music", "Sinach",
  "Nathaniel Bassey", "Mercy Chinwo", "Victoria Orenze", "Dunsin Oyekan",
  "Tim Godfrey", "Ada Ehi", "Frank Edwards",
  // South African gospel
  "Joyous Celebration", "Spirit Of Praise", "Rebecca Malope", "Benjamin Dube",
  "Dr Tumi", "Ntokozo Mbambo", "Hlengiwe Mhlaba", "Solly Mahlangu",
  "Sipho Makhabane", "Winnie Mashaba", "Takie Ndou", "Bongo Maffin",
  "Zaza", "Lebo Sekgobela", "Women In Praise", "Ncandweni Christ Ambassadors",
];

async function fromGospel(): Promise<Release[]> {
  const out: Release[] = [];
  await Promise.all(
    GOSPEL_ARTISTS.map(async (name) => {
      const q = encodeURIComponent(`artist:"${name}"`);
      const data = (await fetchJSON(
        `https://api.deezer.com/search/album?q=${q}&limit=40&order=RANKING`
      )) as { data?: DeezerAlbum[] } | null;
      for (const a of data?.data ?? []) {
        const r = mapDeezer(a, null);
        if (!r) continue;
        // Deezer's album search is FUZZY — `artist:"Zaza"` happily returns
        // house compilations by nobody of the sort. This loop used to stamp
        // every hit as gospel regardless, which is how "Club Ibiza, Vol. 2
        // (Chillhouse Vibes)" and "The View (50 Deephouse Grooves)" ended up
        // in the Gospel bucket. Require the album to actually be by the
        // artist we asked for.
        if (!artistMatches(name, r.artist)) continue;
        r.genre = "Gospel";
        r.tags = ["gospel"];
        // Mood is deliberately NOT forced. Blanket-tagging the entire gospel
        // sweep "euphoric" meant every one of these records scored a mood hit
        // on any request mentioning joy, a party or celebration — which is
        // exactly how a search for "euphoric house to dance to" came back
        // full of mislabelled gospel compilations. Gospel spans jubilant
        // praise and quiet worship; whatever mapDeezer inferred is closer to
        // the truth than one blanket answer.
        out.push(r);
      }
    })
  );
  return out;
}

// ── Source 1f: Grammy winners' complete discographies ────────────────
/**
 * Every Grammy-winning artist (any category, last 59 years) → their WHOLE
 * discography from Deezer.
 *
 * Two-step per artist: resolve the name to a Deezer artist id (so we get the
 * real catalogue rather than fuzzy album-title matches), then page through
 * /artist/{id}/albums until exhausted. Bounded by a worker pool so we never
 * open hundreds of sockets, and every response is cached by the fetch layer.
 */
async function fromGrammyArtists(): Promise<Release[]> {
  const names = GRAMMY_ARTISTS_UNIQUE;
  const out: Release[] = [];
  const CONC = 24;
  const MAX_PAGES = 3; // 3 x 100 — deeper than all but the most prolific acts
  // Hard wall-clock budget. Deezer responses are cached by the fetch layer, so
  // each revalidation picks up where the last one left off and the catalogue
  // fills in over successive runs rather than timing out the whole render.
  const DEADLINE = Date.now() + 20_000;
  let idx = 0;

  const worker = async () => {
    while (idx < names.length) {
      if (Date.now() > DEADLINE) return;
      const name = names[idx++];
      // 1) resolve the artist
      const search = (await fetchJSON(
        `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=1`
      )) as { data?: { id?: number; name?: string }[] } | null;
      const hit = search?.data?.[0];
      if (!hit?.id) continue;

      // Guard against a loose match ("Queen" → "Queen Naija").
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (norm(hit.name ?? "") !== norm(name)) continue;

      // 2) walk the whole discography
      for (let page = 0; page < MAX_PAGES; page++) {
        const albums = (await fetchJSON(
          `https://api.deezer.com/artist/${hit.id}/albums?limit=100&index=${page * 100}`
        )) as { data?: DeezerAlbum[] } | null;
        const rows = albums?.data ?? [];
        for (const a of rows) {
          const r = mapDeezer(a, null);
          if (r) out.push(r);
        }
        if (rows.length < 100) break; // last page
      }
    }
  };

  await Promise.all(Array.from({ length: CONC }, worker));
  return out;
}

// ── Source 1g: regional + canonical sweeps ──────────────────────────
/**
 * Latin America, Brazil, the Caribbean, Asia, the Arab world and Europe, plus
 * the jazz, blues and electronic canons — the parts of music the other sweeps
 * don't reach. Same shape as the Grammy sweep: resolve the name to a Deezer
 * artist id (so we get the real catalogue rather than fuzzy title matches),
 * then page through their discography.
 */
async function fromWorldArtists(): Promise<Release[]> {
  const names = WORLD_ARTISTS_FLAT;
  const out: Release[] = [];
  const CONC = 24;
  const MAX_PAGES = 2; // up to 200 releases per artist
  const DEADLINE = Date.now() + 20_000;
  let idx = 0;

  const worker = async () => {
    while (idx < names.length) {
      if (Date.now() > DEADLINE) return;
      const name = names[idx++];
      const search = (await fetchJSON(
        `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=1`
      )) as { data?: { id?: number; name?: string }[] } | null;
      const hit = search?.data?.[0];
      if (!hit?.id) continue;

      // Guard against a loose match ("Can" → "Canserbero").
      const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (norm(hit.name ?? "") !== norm(name)) continue;

      for (let page = 0; page < MAX_PAGES; page++) {
        const albums = (await fetchJSON(
          `https://api.deezer.com/artist/${hit.id}/albums?limit=100&index=${page * 100}`
        )) as { data?: DeezerAlbum[] } | null;
        const rows = albums?.data ?? [];
        for (const a of rows) {
          const r = mapDeezer(a, null);
          if (r) out.push(r);
        }
        if (rows.length < 100) break;
      }
    }
  };

  await Promise.all(Array.from({ length: CONC }, worker));
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
  // Each feed is ranked independently. Deriving popularity from a shared array's
  // length made the rank depend on which request happened to resolve first, so
  // the albums and songs charts interleaved nondeterministically and "Most
  // Streamed" ordering changed between builds. Rank within the feed instead.
  const perFeed = await Promise.all(
    APPLE_FEEDS.map(async (url) => {
      const data = (await fetchJSON(url)) as { feed?: { results?: AppleFeedResult[] } } | null;
      const rows: Release[] = [];
      (data?.feed?.results ?? []).forEach((r, i) => {
        const artist = r.artistName?.trim();
        const title = r.name?.trim();
        if (!artist || !title || !r.artworkUrl100) return;
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
        // Feed order IS the chart: position 1 => 200, 2 => 199, …
        rel.popularity = 200 - i;
        rows.push(rel);
      });
      return rows;
    })
  );
  return perFeed.flat();
}

/**
 * Fetch the live feed. Returns a de-duplicated, newest-first Release[].
 * Never throws — on total failure it returns an empty array.
 */
export async function getLiveFeed(): Promise<Release[]> {
  const [deezer, apple, genres, africa, gospel, genreArtists, grammy, world] = await Promise.all([
    fromDeezer(),
    fromApple(),
    fromDeezerGenres(),
    fromAfrica(),
    fromGospel(),
    fromGenreArtists(),
    fromGrammyArtists(),
    fromWorldArtists(),
  ]);
  console.log(
    `[feed] deezer: ${deezer.length} · apple: ${apple.length} · genres: ${genres.length} · ` +
      `africa: ${africa.length} · gospel: ${gospel.length} · genreArtists: ${genreArtists.length} · ` +
      `grammy: ${grammy.length} · world: ${world.length}`
  );

  const all: FeedRelease[] = [];
  const byKey = new Map<string, FeedRelease>();
  // Apple + deezer chart first (best popularity signal). Gospel comes before the
  // genre / African sweeps so its explicit "Gospel" tag wins the dedup for any
  // album that also appears in those broader sweeps.
  for (const r of [
    ...apple,
    ...deezer,
    ...gospel,
    ...genres,
    ...africa,
    ...genreArtists,
    ...grammy,
    ...world,
  ] as FeedRelease[]) {
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
