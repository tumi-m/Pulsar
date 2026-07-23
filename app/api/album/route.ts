import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/album?artist=...&title=...
 *
 * Returns the full tracklist for an album via keyless APIs (iTunes lookup
 * primary, Deezer fallback): track number, title, duration, and a
 * same-origin proxied 30s preview URL. Powers the album view.
 */

const norm = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

const proxied = (src: string) => `/api/preview/stream?src=${encodeURIComponent(src)}`;

interface Track {
  number: number;
  title: string;
  durationMs: number;
  previewUrl: string | null;
}

interface AlbumResult {
  tracks: Track[];
  releaseDate: string | null; // original project release date (YYYY-MM-DD)
}

async function fromITunes(artist: string, title: string): Promise<AlbumResult | null> {
  try {
    const na = norm(artist);
    const searchRes = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${title}`)}&entity=album&limit=5`,
      { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } }
    );
    if (!searchRes.ok) return null;
    const search = await searchRes.json();
    const albums: Array<{ collectionId?: number; artistName?: string; collectionName?: string; releaseDate?: string }> =
      search.results ?? [];
    const nt = norm(title);
    const album =
      albums.find(
        (a) => norm(a.artistName ?? "").includes(na.slice(0, 10)) && norm(a.collectionName ?? "").includes(nt)
      ) ?? albums.find((a) => norm(a.artistName ?? "").includes(na.slice(0, 10)));
    if (!album?.collectionId) return null;
    const releaseDate = album.releaseDate ? album.releaseDate.slice(0, 10) : null;

    const lookupRes = await fetch(
      `https://itunes.apple.com/lookup?id=${album.collectionId}&entity=song&limit=200`,
      { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } }
    );
    if (!lookupRes.ok) return null;
    const lookup = await lookupRes.json();
    const items: Array<{
      wrapperType?: string;
      kind?: string;
      trackNumber?: number;
      trackName?: string;
      trackTimeMillis?: number;
      previewUrl?: string;
    }> = lookup.results ?? [];
    const tracks = items
      .filter((i) => i.wrapperType === "track" && i.kind === "song" && i.trackName)
      .map((i) => ({
        number: i.trackNumber ?? 0,
        title: i.trackName!,
        durationMs: i.trackTimeMillis ?? 0,
        previewUrl: i.previewUrl ? proxied(i.previewUrl) : null,
      }))
      .sort((a, b) => a.number - b.number);
    return tracks.length ? { tracks, releaseDate } : null;
  } catch {
    return null;
  }
}

async function fromDeezer(artist: string, title: string): Promise<AlbumResult | null> {
  try {
    const searchRes = await fetch(
      `https://api.deezer.com/search/album?q=${encodeURIComponent(`${artist} ${title}`)}&limit=5`,
      { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } }
    );
    if (!searchRes.ok) return null;
    const search = await searchRes.json();
    const na = norm(artist);
    const album = (search.data ?? []).find(
      (a: { id?: number; artist?: { name?: string } }) =>
        norm(a.artist?.name ?? "").includes(na.slice(0, 10))
    );
    if (!album?.id) return null;
    const albRes = await fetch(`https://api.deezer.com/album/${album.id}`, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!albRes.ok) return null;
    const alb = await albRes.json();
    const releaseDate: string | null =
      typeof alb.release_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(alb.release_date)
        ? alb.release_date
        : null;
    const tracks: Track[] = (alb.tracks?.data ?? []).map(
      (t: { track_position?: number; title?: string; duration?: number; preview?: string }, i: number) => ({
        number: t.track_position ?? i + 1,
        title: t.title ?? "",
        durationMs: (t.duration ?? 0) * 1000,
        previewUrl: t.preview ? proxied(t.preview) : null,
      })
    );
    return tracks.length ? { tracks, releaseDate } : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist")?.slice(0, 200);
  const title = searchParams.get("title")?.slice(0, 200);
  if (!artist || !title) {
    return NextResponse.json({ error: "artist and title required" }, { status: 400 });
  }

  const result = (await fromITunes(artist, title)) ?? (await fromDeezer(artist, title));
  if (!result) {
    return NextResponse.json(
      { error: "no tracklist found", tracks: [], releaseDate: null },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { tracks: result.tracks, releaseDate: result.releaseDate },
    { headers: { "Cache-Control": "public, max-age=86400", "Netlify-Vary": "query" } }
  );
}
