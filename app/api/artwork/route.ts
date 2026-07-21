import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/artwork?artist=...&title=...
 *
 * Resolves official album art via the iTunes Search API and streams the
 * Apple CDN cover (1200x1200). Matches on BOTH artist and album title so
 * it never returns the wrong album's cover — if nothing scores highly
 * enough we 404 and the client shows a styled letter tile instead.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "") // drop "(Deluxe)", "[Remastered]"
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

interface ITunesResult {
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
}

function scoreMatch(r: ITunesResult, artist: string, title: string): number {
  const na = norm(artist);
  const nt = norm(title);
  const ra = norm(r.artistName ?? "");
  const rc = norm(r.collectionName ?? "");
  if (!ra || !rc) return 0;

  let artistScore = 0;
  if (ra === na) artistScore = 3;
  else if (ra.includes(na) || na.includes(ra)) artistScore = 2;

  let titleScore = 0;
  if (rc === nt) titleScore = 3;
  else if (rc.includes(nt) || nt.includes(rc)) titleScore = 2;

  // Require a real signal on BOTH dimensions — this is what stops
  // "SZA / SOS" from matching some unrelated "SOS" compilation.
  if (artistScore < 2 || titleScore < 2) return 0;
  return artistScore + titleScore;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist")?.slice(0, 200);
  const title = searchParams.get("title")?.slice(0, 200);

  if (!artist || !title) {
    return NextResponse.json({ error: "artist and title required" }, { status: 400 });
  }

  try {
    const term = encodeURIComponent(`${artist} ${title}`);
    const searchRes = await fetch(
      `https://itunes.apple.com/search?term=${term}&entity=album&limit=15`,
      { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } }
    );
    if (!searchRes.ok) throw new Error(`iTunes search HTTP ${searchRes.status}`);

    const data = await searchRes.json();
    const results: ITunesResult[] = data.results ?? [];

    // Pick the highest-scoring valid match
    let best: ITunesResult | null = null;
    let bestScore = 0;
    for (const r of results) {
      const s = scoreMatch(r, artist, title);
      if (s > bestScore) {
        bestScore = s;
        best = r;
      }
    }

    if (!best?.artworkUrl100) {
      return NextResponse.json(
        { error: "no confident match" },
        { status: 404, headers: { "Cache-Control": "no-store", "Netlify-Vary": "query" } }
      );
    }

    const artworkUrl = best.artworkUrl100.replace("100x100bb", "1200x1200bb");
    const imgRes = await fetch(artworkUrl, { signal: AbortSignal.timeout(10000) });
    if (!imgRes.ok || !imgRes.body) {
      return NextResponse.json(
        { error: "artwork fetch failed" },
        { status: 502, headers: { "Cache-Control": "no-store", "Netlify-Vary": "query" } }
      );
    }

    return new NextResponse(imgRes.body, {
      headers: {
        "Content-Type": imgRes.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        // Netlify caches function responses by PATH ONLY unless told to key
        // on the query string — without this, every album got served the
        // first cached cover. This header is the fix.
        "Netlify-Vary": "query",
        // Persist in Netlify's durable (global) cache too
        "Netlify-CDN-Cache-Control": "public, durable, s-maxage=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("artwork proxy error:", err);
    return NextResponse.json(
      { error: "artwork lookup failed" },
      { status: 502, headers: { "Cache-Control": "no-store", "Netlify-Vary": "query" } }
    );
  }
}
