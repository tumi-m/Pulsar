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

  /**
   * A 404 is a real answer (lyrics.ovh has no lyrics for the track); any
   * other failure — a 5xx, a 429, a timeout — throws. Both used to collapse to
   * `lyrics: null`, served with a 30-day public cache header, so one bad
   * minute at lyrics.ovh told every visitor "no lyrics" for a month.
   */
  const tryFetch = async (a: string, t: string): Promise<string | null> => {
    const res = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`,
      { signal: AbortSignal.timeout(8000), cache: "no-store" }
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`lyrics.ovh ${res.status}`);
    const data = await res.json();
    const lyrics = typeof data.lyrics === "string" ? data.lyrics.trim() : "";
    return lyrics.length > 0 ? lyrics : null;
  };

  try {
    let lyrics = await tryFetch(artist, title);
    // Retry with a cleaned title if the exact match missed.
    const cleaned = cleanTitle(title);
    if (!lyrics && cleaned && cleaned !== title) lyrics = await tryFetch(artist, cleaned);
    // Found, or genuinely absent: both are stable answers worth caching.
    return NextResponse.json(
      { lyrics },
      { headers: { "Netlify-Vary": "query", "Cache-Control": "public, max-age=2592000" } }
    );
  } catch {
    // The source failed. Say so, and don't let anything cache it.
    return NextResponse.json(
      { lyrics: null, error: "unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
