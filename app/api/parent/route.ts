import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/parent?artist=...&title=...
 *
 * For a single, find the parent project (album/EP/mixtape) it belongs to via
 * the iTunes Search API. Returns { album: { title, artist, artwork } } when the
 * collection has more than one track, else { album: null }. Powers the
 * clickable song title → full tracklist.
 */

const norm = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist")?.slice(0, 200);
  const title = searchParams.get("title")?.slice(0, 200);
  if (!artist || !title) {
    return NextResponse.json({ error: "artist and title required", album: null }, { status: 400 });
  }

  try {
    const na = norm(artist);
    const nt = norm(title);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${title}`)}&entity=song&limit=10`,
      { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } }
    );
    if (!res.ok) return NextResponse.json({ album: null });
    const data = await res.json();
    const results: Array<{
      artistName?: string;
      trackName?: string;
      collectionName?: string;
      trackCount?: number;
      artworkUrl100?: string;
    }> = data.results ?? [];

    // The song by our artist whose title matches — read its parent collection.
    const song =
      results.find(
        (r) => norm(r.artistName ?? "").includes(na.slice(0, 12)) && norm(r.trackName ?? "").includes(nt.slice(0, 12))
      ) ?? results.find((r) => norm(r.artistName ?? "").includes(na.slice(0, 12)));

    const collection = song?.collectionName?.trim();
    const trackCount = song?.trackCount ?? 0;

    // Only a "project" if it has more than one track and isn't the single itself.
    if (!collection || trackCount <= 1 || norm(collection) === nt) {
      return NextResponse.json({ album: null });
    }

    return NextResponse.json(
      {
        album: {
          title: collection,
          artist: song?.artistName ?? artist,
          artwork: song?.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null,
        },
      },
      { headers: { "Cache-Control": "public, max-age=86400", "Netlify-Vary": "query" } }
    );
  } catch {
    return NextResponse.json({ album: null });
  }
}
