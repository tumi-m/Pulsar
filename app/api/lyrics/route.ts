import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/lyrics?artist=...&title=...
 *
 * Keyless lyrics via lyrics.ovh. Returns { lyrics: string | null }. The title
 * is cleaned of "(feat. …)", "- Remaster" and bracketed suffixes to improve the
 * hit-rate, since lyrics.ovh matches on a plain artist/title pair.
 */

function cleanTitle(t: string): string {
  return t
    .replace(/\((feat|ft|with)[^)]*\)/gi, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/-\s*(remaster|remastered|live|mono|stereo|radio edit|single version)[^-]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist")?.slice(0, 200);
  const title = searchParams.get("title")?.slice(0, 200);
  if (!artist || !title) {
    return NextResponse.json({ error: "artist and title required" }, { status: 400 });
  }

  const tryFetch = async (a: string, t: string) => {
    const res = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`,
      { signal: AbortSignal.timeout(8000), next: { revalidate: 2592000 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const lyrics = typeof data.lyrics === "string" ? data.lyrics.trim() : "";
    return lyrics.length > 0 ? lyrics : null;
  };

  try {
    let lyrics = await tryFetch(artist, title);
    // Retry with a cleaned title if the exact match missed.
    const cleaned = cleanTitle(title);
    if (!lyrics && cleaned && cleaned !== title) lyrics = await tryFetch(artist, cleaned);
    return NextResponse.json(
      { lyrics },
      { headers: { "Netlify-Vary": "query", "Cache-Control": "public, max-age=2592000" } }
    );
  } catch {
    return NextResponse.json({ lyrics: null }, { status: 200 });
  }
}
