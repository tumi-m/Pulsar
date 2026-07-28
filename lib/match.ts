/**
 * Shared artist/title matching for the keyless lookup routes.
 *
 * Every one of these routes ("find this album's tracklist", "find this song's
 * preview", "find the parent project") resolves a release by searching a public
 * catalogue and picking a result. Picking loosely is how a user ends up looking
 * at Kanye West's "Bully" while the header says "Donda" — the search returned
 * the artist's other records and the code took the first one.
 *
 * Two rules make that impossible:
 *   1. The artist must match.
 *   2. The title must match — and a numeric remainder is a DIFFERENT record.
 *      "Donda" must never match "Donda 2"; "Bully" must never match "Donda".
 * When nothing satisfies both, the caller returns nothing. An honest "not
 * found" is always better than confidently showing the wrong album.
 */

/** Lowercase, drop bracketed asides and punctuation, collapse whitespace. */
export function normaliseTitle(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "") // (Deluxe Edition), [Explicit]
    .replace(/&/g, "and")
    .replace(/\s*[-–—]\s*(deluxe|expanded|remaster\w*|anniversary|edition|explicit|clean|single|ep|album)\b.*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normaliseArtist(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Edition words that may trail a title without changing which record it is. */
const EDITION_TAIL =
  /^(deluxe|expanded|extended|remaster\w*|anniversary|edition|version|explicit|clean|bonus|reissue|special|complete|collectors?|original|motion picture soundtrack|soundtrack)\b/;

/**
 * Do these two titles refer to the same record?
 *
 * Exact match after normalising, or one is the other plus a recognised edition
 * suffix. A numeric remainder ("2", "vol 3") is rejected outright — sequels and
 * volumes are separate releases and conflating them is the exact failure this
 * guards against.
 */
export function titleMatches(want: string, got: string): boolean {
  const w = normaliseTitle(want);
  const g = normaliseTitle(got);
  if (!w || !g) return false;
  if (w === g) return true;

  const [longer, shorter] = w.length >= g.length ? [w, g] : [g, w];
  // Must share a prefix — "bully" and "donda" share nothing, so they can never
  // be conflated no matter how the search ranked them.
  if (!longer.startsWith(shorter)) return false;

  const rest = longer.slice(shorter.length).trim();
  if (!rest) return true;
  // "donda" vs "donda 2" / "vol 2" — a different instalment, not an edition.
  if (/^(\d|v\s?\d|vol\b|part\b|pt\b|chapter\b)/.test(rest)) return false;
  return EDITION_TAIL.test(rest);
}

/** Is `got` plausibly the artist we asked for? Tolerates features and billing. */
export function artistMatches(want: string, got: string): boolean {
  const w = normaliseArtist(want);
  const g = normaliseArtist(got);
  if (!w || !g) return false;
  return w === g || w.includes(g) || g.includes(w);
}

/**
 * Pick the best candidate that satisfies BOTH rules, or null.
 * Exact title matches win over edition variants.
 */
export function pickBestMatch<T>(
  candidates: T[],
  want: { artist: string; title: string },
  read: (c: T) => { artist: string; title: string }
): T | null {
  const viable = candidates.filter((c) => {
    const got = read(c);
    return artistMatches(want.artist, got.artist) && titleMatches(want.title, got.title);
  });
  if (!viable.length) return null;
  const exact = viable.find(
    (c) => normaliseTitle(read(c).title) === normaliseTitle(want.title)
  );
  return exact ?? viable[0];
}
