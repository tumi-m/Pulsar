import { NextRequest, NextResponse } from "next/server";
import type { Release, ReleaseType } from "@/lib/types";

export const runtime = "nodejs";

/**
 * GET /api/artist?name=...
 *
 * Returns an artist's discography (albums/EPs/singles) as Release-shaped
 * objects with generated platform deep links — keyless via Deezer. Powers the
 * clickable artist name in the album view.
 */

const sp = (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}`;
const am = (q: string) => `https://music.apple.com/search?term=${encodeURIComponent(q)}`;
const td = (q: string) => `https://tidal.com/search?q=${encodeURIComponent(q)}`;
const sc = (q: string) => `https://soundcloud.com/search?q=${encodeURIComponent(q)}`;
const yt = (q: string) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`;

interface DeezerAlbum {
  id?: number;
  title?: string;
  cover_xl?: string;
  cover_big?: string;
  release_date?: string;
  record_type?: string;
}

async function fetchJSON(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function stableId(artist: string, title: string): string {
  let h = 0;
  const s = `${artist}::${title}`.toLowerCase();
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `discog-${(h >>> 0).toString(36)}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name")?.slice(0, 200);
  if (!name) return NextResponse.json({ error: "name required", releases: [] }, { status: 400 });

  try {
    const search = (await fetchJSON(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=1`
    )) as { data?: { id?: number }[] } | null;
    const artistId = search?.data?.[0]?.id;
    if (!artistId) return NextResponse.json({ releases: [] });

    const albums = (await fetchJSON(
      `https://api.deezer.com/artist/${artistId}/albums?limit=100`
    )) as { data?: DeezerAlbum[] } | null;

    const seen = new Set<string>();
    const releases: Release[] = [];
    for (const a of albums?.data ?? []) {
      const title = a.title?.trim();
      const art = a.cover_xl ?? a.cover_big;
      if (!title || !art) continue;
      const key = title.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^a-z0-9]/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      const type: ReleaseType =
        a.record_type === "single" ? "single" : a.record_type === "ep" ? "ep" : "album";
      const date =
        a.release_date && /^\d{4}-\d{2}-\d{2}$/.test(a.release_date) ? a.release_date : "";
      const q = `${name} ${title}`;
      releases.push({
        id: stableId(name, title),
        artist: name,
        title,
        type,
        artwork_url: art,
        release_date: date || "1900-01-01",
        genre: null,
        tags: [],
        mood: "cinematic",
        spotify: sp(q),
        apple_music: am(q),
        tidal: td(q),
        soundcloud: sc(q),
        youtube_music: yt(q),
        created_at: (date || "1900-01-01") + "T00:00:00Z",
        curator_note: null,
      });
    }
    // newest first
    releases.sort((a, b) => (a.release_date < b.release_date ? 1 : -1));
    return NextResponse.json(
      { releases },
      { headers: { "Cache-Control": "public, max-age=86400", "Netlify-Vary": "query" } }
    );
  } catch {
    return NextResponse.json({ releases: [] });
  }
}
