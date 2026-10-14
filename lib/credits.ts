/**
 * Pulsar — Credit graph extraction.
 *
 * African releases encode their credits *in the strings themselves*:
 *
 *   "Kabza De Small & DJ Maphorisa" — "Sponono (feat. Wizkid, Burna Boy)"
 *   "Focalistic"                    — "Ke Star (Prod. by Vigro Deep)"
 *   "Uncle Waffles"                 — "Tanzania (Da Capo Remix)"
 *
 * Distributor pipelines (which is where Spotify/Apple credits come from) drop
 * most of this. We recover it deterministically from the artist + title fields,
 * with no API key and no model, then layer richer sources on top.
 *
 * RULE (inherited from /api/samples): never invent a credit. Every Credit
 * carries its `source` and a `confidence`; the UI shows unverified credits
 * differently and lets the crowd correct them.
 */

import type { Release } from "./types";

export type CreditRole = "main" | "featured" | "producer" | "remixer";
export type CreditSource = "title" | "deezer" | "musicbrainz" | "community";

export interface Credit {
  name: string; // display name, as written
  slug: string; // canonical join key
  role: CreditRole;
  source: CreditSource;
  confidence: number; // 0..1 — community > musicbrainz > deezer > title
}

export interface Person {
  slug: string;
  name: string;
  roles: Partial<Record<CreditRole, string[]>>; // role → release ids
  count: number;
  collaborators: Set<string>;
  latest: string | null;
}

// ── Normalisation ────────────────────────────────────────────────

const DIACRITICS = /[\u0300-\u036f]/g;

/** Canonical key for a person. Merges casing, accents and punctuation noise. */
export function personSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[‘’'`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Tidy a captured name fragment. */
function clean(raw: string): string {
  return raw
    .replace(/[‘’]/g, "'")
    .replace(/^[\s,\-–—&+]+|[\s,\-–—&+.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Version / format noise that is never part of a name.
const TITLE_NOISE =
  /\s*[\(\[]\s*((?:official\s*)?(?:music\s*)?video|official\s*audio|lyric[s]?\s*video|visualizer|audio|explicit|clean|deluxe|expanded|reissue|remaster(?:ed)?|anniversary|bonus\s*track[s]?|radio\s*edit|extended|instrumental|acoustic|single|ep|album|live|mono|stereo)(?:\s*\d{4})?(?:\s*(?:edition|version|mix))?(?:\s*\d{4})?\s*[\)\]]/gi;

const TRAILING_FORMAT = /\s*-\s*(single|ep|deluxe.*|remaster.*|anniversary.*)$/i;

// ── Separator handling ───────────────────────────────────────────
//
// "Kabza De Small & DJ Maphorisa" is two people. "Earth, Wind & Fire" is one.
// You cannot tell these apart with a regex, so we don't try: names already
// known to the app are indexed as ATOMIC and matched greedily, longest first.

const SPLIT = /(\s*(?:,|&|\+|\bx\b|\bX\b|\bvs\.?\b|\band\b|\/|×|;)\s*)/g;

let ATOMIC_MAX_TOKENS = 1;
let ATOMIC: Set<string> = new Set();

/**
 * Seed the atomic-name index — names that *contain* a separator but are a
 * single entity ("Earth, Wind & Fire", "Mellow & Sleazy", "Wisin & Yandel").
 *
 * Call once at module init with every artist name the app already knows
 * (GRAMMY_ARTISTS_UNIQUE, CATALOG artists) plus every distinct `artistName`
 * the feed has returned. Names without a separator are skipped: they could
 * never have been split, so indexing them only wastes memory.
 */
export function registerAtomicArtists(names: Iterable<string>): void {
  for (const n of names) {
    if (!n) continue;
    const parts = n.split(SPLIT).filter((_, i) => i % 2 === 0);
    if (parts.length < 2) continue;
    const s = personSlug(n);
    if (!s) continue;
    ATOMIC.add(s);
    if (parts.length > ATOMIC_MAX_TOKENS) ATOMIC_MAX_TOKENS = parts.length;
  }
}

export function _resetAtomicArtists(): void {
  ATOMIC = new Set();
  ATOMIC_MAX_TOKENS = 1;
}

/**
 * Split a credit string into individual names.
 *
 * Greedy longest-match against the atomic index, so a compound name survives
 * even when nested inside a larger collaboration string:
 *
 *   "Tman Xpress & Mellow & Sleazy" → ["Tman Xpress", "Mellow & Sleazy"]
 *   "Earth, Wind & Fire"            → ["Earth, Wind & Fire"]
 *   "Ruff, Emtee, Sjava & Saudi"    → ["Ruff", "Emtee", "Sjava", "Saudi"]
 */
export function splitNames(raw: string): string[] {
  const s = clean(raw);
  if (!s) return [];

  const pieces = s.split(SPLIT); // [name, sep, name, sep, name, …]
  const names: string[] = [];
  const seps: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    if (i % 2 === 0) names.push(clean(pieces[i]));
    else seps.push(pieces[i]);
  }
  if (names.length < 2) return names.filter(Boolean).length ? [s] : [];

  const out: string[] = [];
  let i = 0;
  while (i < names.length) {
    let matched = false;
    const maxRun = Math.min(ATOMIC_MAX_TOKENS, names.length - i);
    for (let run = maxRun; run >= 2; run--) {
      let joined = names[i];
      for (let k = 1; k < run; k++) joined += seps[i + k - 1] + names[i + k];
      if (ATOMIC.has(personSlug(joined))) {
        out.push(clean(joined));
        i += run;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const n = names[i];
      // A one- or two-character fragment is never a name; the split was wrong
      // (e.g. "AC/DC"). Fall back to the whole string.
      if (n.length > 0 && n.length < 3 && !/^\d/.test(n)) return [s];
      if (n && !/^(the|a|an)$/i.test(n)) out.push(n);
      i++;
    }
  }
  return out.length ? out : [s];
}

// ── Extraction ───────────────────────────────────────────────────

const FEAT =
  /[\(\[]?\s*\b(?:feat|ft|featuring|w\/|with)\b\.?\s*:?\s*([^)\]\[]+)[\)\]]?/i;
const PROD =
  /[\(\[]\s*\b(?:prod|produced|production)\b\.?\s*(?:by)?\s*:?\s*([^)\]]+)[\)\]]/i;
const PROD_BARE =
  /\b(?:prod|produced)\b\.?\s*(?:by)?\s*:?\s+([^()\[\]]+)$/i;
const REMIX =
  /[\(\[]\s*([^)\]]+?)\s+(?:remix|rmx|edit|refix|bootleg|flip|rework|mix)\s*[\)\]]/i;

// Words that sit where a remixer name would but aren't a person.
const NOT_A_REMIXER =
  /^(radio|extended|club|dub|original|instrumental|acoustic|vip|main|album|single|slowed|sped\s*up|reverb|amapiano|afro|house|tech)$/i;

export interface ParsedCredits {
  cleanTitle: string; // title with credit fragments removed — safe for dedupe
  credits: Credit[];
}

/** Parse credits out of an artist + title pair. Deterministic, keyless. */
export function parseCredits(
  artistField: string,
  titleField: string
): ParsedCredits {
  const credits: Credit[] = [];
  const seen = new Set<string>();

  const push = (
    name: string,
    role: CreditRole,
    source: CreditSource,
    confidence: number
  ) => {
    const n = clean(name);
    if (!n || n.length < 2) return;
    const slug = personSlug(n);
    if (!slug) return;
    const key = `${slug}|${role}`;
    if (seen.has(key)) return;
    seen.add(key);
    credits.push({ name: n, slug, role, source, confidence });
  };

  let title = (titleField ?? "")
    .replace(TITLE_NOISE, " ")
    .replace(TRAILING_FORMAT, "")
    .trim();
  let artist = (artistField ?? "").trim();

  // 1. Remixer first — "(Da Capo Remix)" must not be read as part of the title.
  const remix = title.match(REMIX);
  if (remix) {
    const candidate = clean(remix[1]);
    if (!NOT_A_REMIXER.test(candidate)) {
      for (const n of splitNames(candidate)) push(n, "remixer", "title", 0.75);
      title = title.replace(remix[0], " ");
    }
  }

  /** Pull `re` out of a field, credit the captured names, return the remainder. */
  const extract = (
    field: string,
    res: RegExp[],
    role: CreditRole,
    confidence: number
  ): string => {
    for (const re of res) {
      const m = field.match(re);
      if (!m) continue;
      for (const n of splitNames(m[1])) push(n, role, "title", confidence);
      return field.replace(m[0], " ");
    }
    return field;
  };

  // 2. Producer — from either field.
  title = extract(title, [PROD, PROD_BARE], "producer", 0.8);
  artist = extract(artist, [PROD, PROD_BARE], "producer", 0.8);

  // 3. Featured — from either field.
  title = extract(title, [FEAT], "featured", 0.9);
  artist = extract(artist, [FEAT], "featured", 0.9);

  // 4. Whatever remains in the artist field is a main credit.
  for (const n of splitNames(artist)) push(n, "main", "title", 0.95);

  const cleanTitle =
    clean(title.replace(/\s*[\(\[]\s*[\)\]]\s*/g, " ")) || titleField;

  // Stable display order: main → featured → producer → remixer. Within a role,
  // preserve the order the names appeared in the string (a stable sort keeps
  // "Kabza De Small & DJ Maphorisa" in that order rather than alphabetising).
  credits.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);

  return { cleanTitle, credits };
}

// ── Merging richer sources ───────────────────────────────────────

const RANK: Record<CreditSource, number> = {
  community: 4,
  musicbrainz: 3,
  deezer: 2,
  title: 1,
};
const ROLE_ORDER: Record<CreditRole, number> = {
  main: 0,
  featured: 1,
  producer: 2,
  remixer: 3,
};

/** Higher-ranked sources win on conflict; a person keeps every distinct role. */
export function mergeCredits(...lists: Credit[][]): Credit[] {
  const best = new Map<string, Credit>();
  for (const list of lists) {
    for (const c of list) {
      const key = `${c.slug}|${c.role}`;
      const cur = best.get(key);
      if (!cur || RANK[c.source] > RANK[cur.source]) best.set(key, c);
    }
  }
  return [...best.values()].sort(
    (a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name)
  );
}

/** Deezer track objects carry a `contributors` array with a `role` field. */
export function creditsFromDeezer(
  contributors: { name?: string; role?: string }[] | undefined
): Credit[] {
  if (!Array.isArray(contributors)) return [];
  const out: Credit[] = [];
  for (const c of contributors) {
    if (!c?.name) continue;
    out.push({
      name: c.name,
      slug: personSlug(c.name),
      role: /featur/i.test(c.role ?? "") ? "featured" : "main",
      source: "deezer",
      confidence: 0.9,
    });
  }
  return out;
}

// ── The graph ────────────────────────────────────────────────────

export interface CreditGraph {
  people: Map<string, Person>;
  byRelease: Map<string, Credit[]>;
}

/**
 * Build the person index over a set of releases. O(n) — cheap enough to run on
 * every ISR revalidation, and cheap enough to run in the browser over the
 * client-side slice.
 */
export function buildCreditGraph(releases: Release[]): CreditGraph {
  const people = new Map<string, Person>();
  const byRelease = new Map<string, Credit[]>();

  for (const r of releases) {
    const { credits } = parseCredits(r.artist, r.title);
    byRelease.set(r.id, credits);
    const slugs = credits.map((c) => c.slug);

    for (const c of credits) {
      let p = people.get(c.slug);
      if (!p) {
        p = {
          slug: c.slug,
          name: c.name,
          roles: {},
          count: 0,
          collaborators: new Set(),
          latest: null,
        };
        people.set(c.slug, p);
      }
      (p.roles[c.role] ??= []).push(r.id);
      p.count++;
      if (!p.latest || (r.release_date && r.release_date > p.latest)) {
        p.latest = r.release_date ?? null;
      }
      for (const s of slugs) if (s !== c.slug) p.collaborators.add(s);
    }
  }
  return { people, byRelease };
}

/**
 * People ranked by how much of the *recent* catalogue they touch — the
 * "who is running the scene right now" list. Producers weigh heaviest,
 * because that is the signal nobody else surfaces.
 */
export function topPeople(
  graph: CreditGraph,
  opts: { role?: CreditRole; since?: string; limit?: number } = {}
): Person[] {
  const { role, since, limit = 50 } = opts;
  const scored: { p: Person; s: number }[] = [];
  for (const p of graph.people.values()) {
    if (role && !p.roles[role]?.length) continue;
    if (since && (!p.latest || p.latest < since)) continue;
    scored.push({
      p,
      s:
        (p.roles.producer?.length ?? 0) * 3 +
        (p.roles.remixer?.length ?? 0) * 2 +
        (p.roles.featured?.length ?? 0) * 1.5 +
        (p.roles.main?.length ?? 0),
    });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.p);
}
