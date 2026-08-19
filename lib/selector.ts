import type { Release } from "./types";
import { genreBucket, type GenreBucket } from "./utils";

/**
 * The Selector's matching engine: free text in, ranked releases out.
 *
 * Extracted from components/AiChat.tsx so it can be tested directly — the
 * ranking is the part of the feature people judge, and it was wrong in a way
 * that only shows up on real data.
 */

// keyword → signal maps (a light, keyless read of the vibe)
export const MOOD_WORDS: Record<string, string[]> = {
  euphoric: ["happy", "joy", "euphoric", "uplifting", "party", "hype", "celebrate", "bright"],
  melancholic: ["sad", "melancholy", "heartbreak", "cry", "blue", "lonely", "rainy", "moody"],
  energetic: ["energy", "energetic", "workout", "gym", "run", "pump", "fast", "aggressive"],
  ambient: ["ambient", "calm", "relax", "chill", "study", "focus", "sleep", "peaceful"],
  raw: ["raw", "gritty", "angry", "heavy", "loud", "rebellious"],
  cinematic: ["cinematic", "epic", "dramatic", "film", "soundtrack", "grand"],
  hypnotic: ["hypnotic", "trance", "dreamy", "psychedelic", "trippy", "loop"],
  tender: ["tender", "love", "romantic", "soft", "gentle", "intimate", "sweet"],
};

export const GENRE_WORDS: Record<GenreBucket, string[]> = {
  "Hip-Hop": ["hip hop", "hip-hop", "rap", "trap", "drill", "boom bap"],
  Afrobeats: ["afrobeats", "afrobeat", "afropop", "afro-fusion", "naija", "highlife"],
  Amapiano: ["amapiano", "yanos", "log drum"],
  House: ["house", "gqom", "kwaito", "afro house", "deep house"],
  Electronic: ["electronic", "edm", "techno", "dance", "synth", "disco", "idm", "trance"],
  Reggae: ["reggae", "dancehall", "dub", "ska"],
  "Soul / R&B": ["soul", "r&b", "rnb", "funk", "neo-soul"],
  Gospel: ["gospel", "worship", "praise", "christian", "spiritual", "hymn"],
  Pop: ["pop", "synth-pop", "bedroom pop"],
  Rock: ["rock", "punk", "grunge", "indie", "shoegaze", "alt", "guitar"],
  Metal: ["metal", "doom", "sludge", "stoner", "hardcore"],
  Jazz: ["jazz", "bebop", "fusion", "swing"],
  Blues: ["blues", "delta blues", "rhythm and blues"],
  Latin: ["latin", "reggaeton", "salsa", "bachata", "cumbia", "bossa"],
  Classical: ["classical", "orchestra", "symphony", "opera", "piano"],
  "Folk / Country": ["folk", "country", "americana", "singer-songwriter", "acoustic"],
};

export interface Parsed {
  moods: string[];
  genres: GenreBucket[];
  decades: string[];
  freeText: string;
}

export function parse(text: string): Parsed {
  const q = text.toLowerCase();
  const moods = Object.entries(MOOD_WORDS)
    .filter(([, kws]) => kws.some((k) => q.includes(k)))
    .map(([m]) => m);
  const genres = (Object.entries(GENRE_WORDS) as [GenreBucket, string[]][])
    .filter(([, kws]) => kws.some((k) => q.includes(k)))
    .map(([g]) => g);
  // Decades are matched as a date PREFIX, so they must be three characters —
  // "199" covers 1990-1999. This used to push the full "1990", which matched
  // only records released in the single year 1990: "more 80s" (which is in the
  // refine placeholder) silently returned almost nothing.
  const decades: string[] = [];
  for (const d of ["50", "60", "70", "80", "90"]) {
    if (q.includes(`${d}s`)) decades.push(`19${d[0]}`);
  }
  if (q.includes("2000s") || q.includes("00s")) decades.push("200");
  if (q.includes("2010s") || q.includes("10s")) decades.push("201");
  if (q.includes("2020s") || q.includes("20s")) decades.push("202");
  return { moods, genres, decades, freeText: q };
}

/** Weights, named so the reasoning is visible at the call site. */
export const SCORE = {
  /** The record's genre is one you asked for. The strongest signal there is. */
  genreHit: 4,
  /** It belongs to a DIFFERENT named genre — it contradicts the request. */
  genreMiss: -4,
  /** Mood supports a genre match; it does not substitute for one. */
  moodHit: 2,
  decadeHit: 2,
  /** A query word appearing anywhere in the metadata. The weakest signal. */
  wordHit: 1,
} as const;

/**
 * Score how well a release answers the request.
 *
 * The weights matter more than they look. "euphoric house to dance to" used to
 * come back full of gospel compilations, because a mood hit scored the same as
 * a genre hit and a CONTRADICTING genre cost nothing — so a record wrongly
 * tagged euphoric could ride one mood match plus the word "house" appearing in
 * its title straight past records that were actually house.
 *
 * So genre outranks mood when you name one, and naming a genre actively
 * rejects records belonging to a different named genre.
 */
export function buildList(releases: Release[], p: Parsed, limit = 80): Release[] {
  const words = p.freeText.split(/\s+/).filter((w) => w.length > 3);
  const scored = releases.map((r) => {
    let s = 0;
    const bucket = genreBucket(r.genre);

    if (bucket && p.genres.includes(bucket)) {
      s += SCORE.genreHit;
    } else if (p.genres.length > 0 && bucket) {
      s += SCORE.genreMiss;
    }

    if (r.mood && p.moods.includes(r.mood)) s += SCORE.moodHit;
    if (p.decades.some((d) => r.release_date.startsWith(d))) s += SCORE.decadeHit;

    const hay = `${r.artist} ${r.title} ${r.genre ?? ""} ${r.label ?? ""}`.toLowerCase();
    for (const w of words) if (hay.includes(w)) s += SCORE.wordHit;

    return { r, s };
  });
  return scored
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ r }) => r);
}
