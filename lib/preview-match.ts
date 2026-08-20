/**
 * Matching rules for resolving a 30-second preview to the right record.
 *
 * Extracted from app/api/preview/route.ts so the rules can be tested directly —
 * App Router route files should only export handlers, and this logic is where
 * the bugs live.
 *
 * The guarantee these rules exist to protect: never return the WRONG song. A
 * silent player is a disappointment; playing a different record than the one on
 * screen is a defect the listener can't even diagnose.
 */

export const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

/**
 * Is this release credited to a compilation rather than a performer?
 *
 * This is why "No preview available" kept appearing. A record credited to
 * "Various Artists" has its TRACKS credited to the actual performers on every
 * store — iTunes and Deezer both return "Tame Impala" for a track on a
 * chillwave compilation — so an artist check compared "Tame Impala" against
 * "Various Artists" and rejected every candidate. No compilation could ever
 * resolve a preview, and the live feed is full of them.
 */
export const isCompilation = (artist: string): boolean =>
  /^(various(\s+artists?)?|va|v\.a\.|compilation|assorted)$/i.test(artist.trim());

/**
 * Does a candidate's artist plausibly match the one we asked for?
 * Prefix-based so "Beyoncé" matches "Beyoncé feat. Jay-Z".
 */
export const artistMatches = (candidate: string, wanted: string): boolean => {
  const c = norm(candidate);
  const w = norm(wanted);
  if (!c || !w) return false;
  return c.includes(w.slice(0, 12)) || w.includes(c.slice(0, 12));
};

/** 2 = exact, 1 = one contains the other, 0 = unrelated. */
export const titleCloseness = (candidate: string, wanted: string): number => {
  const c = norm(candidate);
  const w = norm(wanted);
  if (!c || !w) return 0;
  if (c === w) return 2;
  return c.includes(w) || w.includes(c) ? 1 : 0;
};

/**
 * Should this candidate be considered at all?
 *
 * For a normal release the ARTIST must match. For a compilation there is no
 * performer to verify against, so the ALBUM must be the one we asked for —
 * which preserves the same guarantee by a different route.
 */
export function candidateAcceptable(opts: {
  wantedArtist: string;
  wantedTitle: string;
  candidateArtist: string;
  candidateAlbum: string;
}): boolean {
  if (isCompilation(opts.wantedArtist)) {
    return titleCloseness(opts.candidateAlbum, opts.wantedTitle) >= 1;
  }
  return artistMatches(opts.candidateArtist, opts.wantedArtist);
}
