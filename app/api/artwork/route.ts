import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/artwork?artist=...&title=...
 *
 * Fallback artwork resolver. Looks the release up on the iTunes Search
 * API and streams the official Apple CDN cover (1200x1200). Responses
 * carry long cache headers so the CDN serves repeats without re-fetching.
 */
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
      `https://itunes.apple.com/search?term=${term}&entity=album&limit=3`,
      { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } }
    );
    if (!searchRes.ok) throw new Error(`iTunes search HTTP ${searchRes.status}`);

    const data = await searchRes.json();
    const results: Array<{ artistName?: string; artworkUrl100?: string }> =
      data.results ?? [];

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const match =
      results.find((r) =>
        norm(r.artistName ?? "").includes(norm(artist).slice(0, 12))
      ) ?? results[0];

    if (!match?.artworkUrl100) {
      return NextResponse.json({ error: "no artwork found" }, { status: 404 });
    }

    const artworkUrl = match.artworkUrl100.replace("100x100bb", "1200x1200bb");
    const imgRes = await fetch(artworkUrl, { signal: AbortSignal.timeout(10000) });
    if (!imgRes.ok || !imgRes.body) {
      return NextResponse.json({ error: "artwork fetch failed" }, { status: 502 });
    }

    return new NextResponse(imgRes.body, {
      headers: {
        "Content-Type": imgRes.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("artwork proxy error:", err);
    return NextResponse.json({ error: "artwork lookup failed" }, { status: 502 });
  }
}
