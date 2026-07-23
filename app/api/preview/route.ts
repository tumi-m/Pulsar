import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/preview?artist=...&title=...
 *
 * Finds a free 30-second preview MP3 for a release via keyless APIs
 * (iTunes Search primary, Deezer fallback). Returns metadata plus a
 * same-origin proxied stream URL so the Web Audio analyser can read the
 * waveform cross-origin-safely. Powers the live visualizer.
 */

const norm = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

interface Preview {
  previewUrl: string; // proxied
  track: string;
  artist: string;
  artworkUrl: string | null;
  source: "itunes" | "deezer";
}

function proxied(src: string): string {
  return `/api/preview/stream?src=${encodeURIComponent(src)}`;
}

// The artist MUST reasonably match, or we don't return a preview at all —
// better silent than the wrong song.
const artistMatches = (candidate: string, wanted: string): boolean => {
  const c = norm(candidate);
  const w = norm(wanted);
  if (!c || !w) return false;
  const cw = c.slice(0, 12);
  const ww = w.slice(0, 12);
  return c.includes(ww) || w.includes(cw);
};
const titleCloseness = (candidate: string, wanted: string): number => {
  const c = norm(candidate);
  const w = norm(wanted);
  if (!c || !w) return 0;
  if (c === w) return 2;
  return c.includes(w) || w.includes(c) ? 1 : 0;
};

async function fromITunes(artist: string, title: string): Promise<Preview | null> {
  try {
    // Prefer tracks from the matching album, else a plain song search.
    const urls = [
      `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&attribute=albumTerm&entity=song&limit=25`,
      `https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${title}`)}&entity=song&limit=10`,
    ];
    for (const url of urls) {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
      if (!res.ok) continue;
      const data = await res.json();
      const results: Array<{
        artistName?: string;
        trackName?: string;
        previewUrl?: string;
        artworkUrl100?: string;
      }> = data.results ?? [];
      // Require the artist to match; pick the closest title among those.
      let best: (typeof results)[number] | null = null;
      let bestScore = -1;
      for (const r of results) {
        if (!r.previewUrl || !artistMatches(r.artistName ?? "", artist)) continue;
        const score = titleCloseness(r.trackName ?? "", title);
        if (score > bestScore) {
          bestScore = score;
          best = r;
        }
      }
      if (best?.previewUrl) {
        return {
          previewUrl: proxied(best.previewUrl),
          track: best.trackName ?? title,
          artist: best.artistName ?? artist,
          artworkUrl: best.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null,
          source: "itunes",
        };
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

async function fromDeezer(artist: string, title: string): Promise<Preview | null> {
  try {
    const res = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(`${artist} ${title}`)}&limit=10`,
      { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const results: Array<{
      preview?: string;
      title?: string;
      artist?: { name?: string };
      album?: { cover_big?: string };
    }> = data.data ?? [];
    // Require the artist to match; pick the closest title among those.
    let best: (typeof results)[number] | null = null;
    let bestScore = -1;
    for (const r of results) {
      if (!r.preview || !artistMatches(r.artist?.name ?? "", artist)) continue;
      const score = titleCloseness(r.title ?? "", title);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    if (best?.preview) {
      return {
        previewUrl: proxied(best.preview),
        track: best.title ?? title,
        artist: best.artist?.name ?? artist,
        artworkUrl: best.album?.cover_big ?? null,
        source: "deezer",
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist")?.slice(0, 200);
  const title = searchParams.get("title")?.slice(0, 200);
  if (!artist || !title) {
    return NextResponse.json({ error: "artist and title required" }, { status: 400 });
  }

  const preview = (await fromITunes(artist, title)) ?? (await fromDeezer(artist, title));
  if (!preview) {
    return NextResponse.json(
      { error: "no preview available" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(preview, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Netlify-Vary": "query",
    },
  });
}
