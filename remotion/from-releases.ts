import type { Release } from "../lib/types";
import type { CrateRecapProps } from "./props";
import { MAX_RECORDS } from "./tokens";

/**
 * A crate (app-side Release records) → Crate Recap input props.
 *
 * App-only: the CLI bundle never imports this, so it may know about lib/types.
 */

/**
 * The hosts next.config.ts lets next/image fetch from (images.remotePatterns),
 * restated because the config file is no thing to pull into a client chunk.
 * test/remotion-export.test.ts holds the two lists together with Next's own
 * matcher, so a host added there and not here fails the build's tests rather
 * than quietly turning that host's covers into cassettes.
 */
export const IMAGE_HOSTS = [
  "i.scdn.co",
  "**.mzstatic.com",
  "**.cloudfront.net",
  "**.supabase.co",
  "**.bcbits.com",
  "**.ytimg.com",
  "lh3.googleusercontent.com",
  "upload.wikimedia.org",
  "**.dzcdn.net",
  "coverartarchive.org",
  "**.archive.org",
] as const;

/** Whether next/image will serve `url` — https on a listed host, as Next matches it. */
export function isOptimizableImage(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.port !== "") return false;
  const host = parsed.hostname;
  return IMAGE_HOSTS.some((pattern) =>
    // "**.x" is any subdomain of x (never x itself), as picomatch reads it for Next.
    pattern.startsWith("**.") ? host.endsWith(pattern.slice(2)) && host.length > pattern.length - 2 : host === pattern
  );
}

/**
 * The browser exporter paints images onto a canvas, and one cross-origin image
 * would taint it and fail the encode, so every cover has to come from Pulsar's
 * own origin. The order is <Artwork>'s (components/Artwork.tsx):
 *
 *   1. the stored artwork_url — through the app's own next/image endpoint,
 *      which fetches it server-side for any host in next.config, so a cover
 *      the crate panel shows (Spotify, Bandcamp, Deezer…) is the cover the
 *      video shows;
 *   2. /api/artwork, the iTunes lookup, keyed on the raw title as there —
 *      only as a fallback, since it answers 404 when it isn't confident and
 *      can find a different edition;
 *   3. (in the composition) the generated cassette.
 *
 * A stored URL on a host next/image won't serve skips straight to (2).
 */
export function recapArtwork(r: Pick<Release, "artist" | "title" | "artwork_url">): {
  artworkUrl: string;
  artworkFallbackUrl: string | null;
} {
  const proxy = `/api/artwork?artist=${encodeURIComponent(r.artist)}&title=${encodeURIComponent(r.title)}`;
  const stored = r.artwork_url?.trim() ?? "";
  // Already same-origin. The proxy itself has nothing behind it to fall back to.
  if (stored.startsWith("/") && !stored.startsWith("//")) {
    return { artworkUrl: stored, artworkFallbackUrl: stored.startsWith("/api/") ? null : proxy };
  }
  if (isOptimizableImage(stored)) {
    // w=828: the next/image width nearest the 820px card; q=75 is next/image's own default.
    return { artworkUrl: `/_next/image?url=${encodeURIComponent(stored)}&w=828&q=75`, artworkFallbackUrl: proxy };
  }
  return { artworkUrl: proxy, artworkFallbackUrl: null };
}

export function recapPropsFromReleases(crateName: string, releases: readonly Release[], withAudio: boolean): CrateRecapProps {
  return {
    crateName,
    withAudio,
    totalRecords: releases.length,
    records: releases.slice(0, MAX_RECORDS).map((r) => ({
      title: r.clean_title || r.title,
      artist: r.artist,
      ...recapArtwork(r),
      year: r.release_date,
    })),
  };
}
